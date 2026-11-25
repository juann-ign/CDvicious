import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, getValidAccessToken } from "@/lib/session";
import mockCollection from "@/mocks/collection.json";
import { cached } from "@/lib/serverCache";
import { isCollectionAlbum, normalizeCollectionAlbum, normalizeGenres } from "@/lib/collectionFilters";
import type { AlbumItem } from "@/types/crate";
import {
  fetchArtistGenresDetailed,
  fetchSpotifyWebApi,
  SpotifyApiError,
} from "@/lib/spotify";

const SPOTIFY_MAX_LIMIT = 50;
const COLLECTION_BASE_TTL_MS = 2 * 60 * 1000;
const COLLECTION_GENRES_TTL_MS = 10 * 60 * 1000;

type GenreResponse = {
  albums: AlbumItem[];
  state: "complete" | "empty" | "unavailable" | "partial" | "error";
  resolved: number;
  total: number;
  error?: SpotifyApiError;
};

// Rejected loaders are not cached. The partial payload still reaches the UI,
// while an explicit retry can query unresolved artists immediately.
class IncompleteGenres extends Error {
  constructor(readonly result: GenreResponse) { super("incomplete artist genres"); }
}

function genreResponse(result: GenreResponse) {
  const headers: Record<string, string> = {
    "X-CDV-Genres-State": result.state,
    "X-CDV-Genres-Resolved-Artists": String(result.resolved),
    "X-CDV-Genres-Total-Artists": String(result.total),
    "Cache-Control": "no-store",
  };
  if (result.error) {
    headers["X-CDV-Genres-Error-Status"] = String(result.error.status);
    if (result.error.retryAfter) headers["Retry-After"] = result.error.retryAfter;
  }
  return NextResponse.json(result.albums, { headers });
}

interface SpotifyArtistRef {
  id: string;
  name: string;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  release_date: string;
  label?: string;
  images: { url: string; width: number; height: number }[];
  artists: SpotifyArtistRef[];
}

interface SpotifySavedAlbumItem {
  album: SpotifyAlbum;
}

interface SpotifySavedAlbumsResponse {
  items?: SpotifySavedAlbumItem[];
  next?: string | null;
}

function cacheKey(refreshToken: string | undefined, accessToken: string) {
  const identity = refreshToken || accessToken;
  return createHash("sha256").update(identity).digest("hex");
}

function collectionCacheKey(
  identityHash: string,
  variant: "base" | "genres",
) {
  return `collection:${variant}:${identityHash}`;
}

function parseSpotifyReason(body: string) {
  try {
    const data = JSON.parse(body) as {
      error?: { reason?: string };
    };
    return data.error?.reason;
  } catch {
    return undefined;
  }
}

async function fetchAllAlbums(accessToken: string) {
  const byId = new Map<string, SpotifyAlbum>();
  const seenNext = new Set<string>();
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const res = await fetchSpotifyWebApi(
      accessToken,
      "GET /v1/me/albums",
      `https://api.spotify.com/v1/me/albums?limit=${SPOTIFY_MAX_LIMIT}&offset=${offset}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );

    if (!res.ok) {
      const body = await res.text();

      throw new SpotifyApiError(
        `spotify saved albums failed: ${res.status}`,
        res.status,
        parseSpotifyReason(body),
        res.headers.get("retry-after") ?? undefined,
      );
    }

    const data = (await res.json()) as SpotifySavedAlbumsResponse | null;
    if (!data || !Array.isArray(data.items) || !data.items.every((item) => item && isCollectionAlbum(item.album))) {
      throw new SpotifyApiError("saved album response is malformed", 502, "INVALID_COLLECTION_RESPONSE");
    }
    const items = data.items;

    const previousSize = byId.size;
    for (const item of items) {
      const album = normalizeCollectionAlbum(item.album);
      byId.set(album.id, album as SpotifyAlbum);
    }
    hasMore = Boolean(data.next);
    if (hasMore) {
      let nextOffset = Number.NaN;
      try { nextOffset = Number(new URL(data.next!).searchParams.get("offset")); } catch { /* rejected below */ }
      if (!items.length || byId.size === previousSize || seenNext.has(data.next!) || !Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
        throw new SpotifyApiError("saved album pagination did not progress", 502, "INVALID_PAGINATION");
      }
      seenNext.add(data.next!);
      offset = nextOffset;
    }
  }

  return [...byId.values()];
}

export async function GET(request: NextRequest) {
  // Dev/testing only: never touch session, server cache, or Spotify in mock mode.
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const includeGenres =
      request.nextUrl.searchParams.get("includeGenres") === "1";

    if (!includeGenres) {
      return NextResponse.json(
        mockCollection.map((album) => ({ ...album, genres: [] })),
        { headers: { "X-CDV-Genres-State": "not-requested" } },
      );
    }
    const artists = new Set(mockCollection.flatMap((album) => album.artists.map((artist) => artist.id)));
    const albums: AlbumItem[] = mockCollection.map((album) => ({ ...album, genres: normalizeGenres(album.genres), genreMetadata: {
      source: "demo", state: "complete", resolvedArtists: new Set(album.artists.map((artist) => artist.id)).size, totalArtists: new Set(album.artists.map((artist) => artist.id)).size,
    } }));
    return genreResponse({ albums, state: albums.some((album) => album.genres?.length) ? "complete" : "empty", resolved: artists.size, total: artists.size });
  }

  const includeGenres =
    request.nextUrl.searchParams.get("includeGenres") === "1";

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const accessToken = session.isExpired ? await getValidAccessToken() : session.accessToken;
  if (!accessToken) return NextResponse.json({ error: "no_session" }, { status: 401 });

  const identityHash = cacheKey(session.refreshToken, session.accessToken);
  const baseKey = collectionCacheKey(identityHash, "base");

  try {
    if (!includeGenres) {
      const allAlbums = await cached(
        baseKey,
        COLLECTION_BASE_TTL_MS,
        () => fetchAllAlbums(accessToken),
      );

      return NextResponse.json(allAlbums, { headers: { "X-CDV-Genres-State": "not-requested" } });
    }

    // The base catalog expires sooner than enrichment. Resolve it before the
    // genre cache lookup so a changed library cannot receive an older array.
    const allAlbums = await cached(
      baseKey,
      COLLECTION_BASE_TTL_MS,
      () => fetchAllAlbums(accessToken),
    );
    const catalogHash = createHash("sha256").update(JSON.stringify(allAlbums)).digest("hex");
    const genresKey = `${collectionCacheKey(identityHash, "genres")}:coverage-v2:${catalogHash}`;
    const withGenres = await cached(
      genresKey,
      COLLECTION_GENRES_TTL_MS,
      async () => {
        const allArtistIds = allAlbums.flatMap((album) =>
          album.artists.map((artist) => artist.id),
        );

        const fetched = await fetchArtistGenresDetailed(
          accessToken,
          allArtistIds,
          { refreshUnavailable: request.nextUrl.searchParams.get("retry") === "1" },
        );

        const albums: AlbumItem[] = allAlbums.map((album) => {
          const ids = [...new Set(album.artists.map((artist) => artist.id).filter(Boolean))];
          const resolvedArtists = ids.filter((id) => Object.hasOwn(fetched.byArtist, id)).length;
          return { ...album, genres: normalizeGenres(ids.flatMap((id) => fetched.byArtist[id] ?? [])), genreMetadata: {
            source: "spotify-artist", state: resolvedArtists === 0 ? "unavailable" : resolvedArtists === ids.length ? "complete" : "partial",
            resolvedArtists, totalArtists: ids.length,
          } };
        });
        const resolved = Object.keys(fetched.byArtist).length;
        const incomplete = fetched.unresolvedArtistIds.length > 0 || albums.some((album) => album.genreMetadata?.state === "unavailable");
        const result: GenreResponse = { albums, resolved, total: fetched.requestedArtistIds.length, error: fetched.error,
          state: incomplete ? resolved ? "partial" : !fetched.error && fetched.unavailableArtistIds?.length ? "unavailable" : "error" : albums.some((album) => album.genres?.length) ? "complete" : "empty" };
        if (incomplete) throw new IncompleteGenres(result);
        return result;
      },
    );

    return genreResponse(withGenres);
  } catch (error) {
    if (error instanceof IncompleteGenres) return genreResponse(error.result);
    if (error instanceof SpotifyApiError) {
      const responseHeaders =
        error.retryAfter !== undefined
          ? { "Retry-After": error.retryAfter }
          : undefined;

      if (error.status === 429) {
        return NextResponse.json(
          {
            error: "spotify_rate_limited",
            status: error.status,
            reason: error.reason ?? "RATE_LIMITED",
          },
          {
            status: 429,
            headers: responseHeaders,
          },
        );
      }

      return NextResponse.json(
        {
          error: "spotify_error",
          status: error.status,
          reason: error.reason ?? null,
        },
        {
          status: error.status === 401 ? 401 : 502,
        },
      );
    }

    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }
}
