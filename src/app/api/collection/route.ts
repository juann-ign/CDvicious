import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import mockCollection from "@/mocks/collection.json";
import {
  fetchArtistGenres,
  fetchSpotifyWebApi,
  SpotifyApiError,
} from "@/lib/spotify";

const SPOTIFY_MAX_LIMIT = 50;
const SAFETY_CEILING = 3000;
const COLLECTION_CACHE_TTL_MS = 60_000;

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

interface CollectionCacheEntry {
  albums: SpotifyAlbum[];
  expiresAt: number;
}

const genreCache = new Map<string, string[]>();
const collectionCache = new Map<string, CollectionCacheEntry>();
const collectionInFlight = new Map<string, Promise<SpotifyAlbum[]>>();

function cacheKey(refreshToken: string) {
  return createHash("sha256").update(refreshToken).digest("hex");
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

async function fetchAllAlbums(accessToken: string, refreshToken: string) {
  const key = cacheKey(refreshToken);
  const cached = collectionCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.albums;
  }

  const pending = collectionInFlight.get(key);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const allAlbums: SpotifyAlbum[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore && allAlbums.length < SAFETY_CEILING) {
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

      const data = (await res.json()) as SpotifySavedAlbumsResponse;
      const items = data.items ?? [];

      allAlbums.push(...items.map((item) => item.album));
      hasMore = Boolean(data.next);
      offset += SPOTIFY_MAX_LIMIT;
    }

    collectionCache.set(key, {
      albums: allAlbums,
      expiresAt: Date.now() + COLLECTION_CACHE_TTL_MS,
    });

    return allAlbums;
  })();

  collectionInFlight.set(key, request);

  try {
    return await request;
  } finally {
    collectionInFlight.delete(key);
  }
}

export async function GET(request: NextRequest) {
  const includeGenres = request.nextUrl.searchParams.get("includeGenres") === "1";

  // Dev/testing only: return the mock while preserving the includeGenres contract.
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    if (!includeGenres) {
      return NextResponse.json(
        mockCollection.map((album) => ({ ...album, genres: [] })),
      );
    }

    return NextResponse.json(mockCollection);
  }

  const session = await getSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const allAlbums = await fetchAllAlbums(session.accessToken, session.refreshToken);

    if (!includeGenres) {
      return NextResponse.json(allAlbums);
    }

    const allArtistIds = allAlbums.flatMap((a) =>
      a.artists.map((ar) => ar.id),
    );
    const uncachedIds = allArtistIds.filter((id) => !genreCache.has(id));

    if (uncachedIds.length > 0) {
      const fetched = await fetchArtistGenres(session.accessToken, uncachedIds);

      for (const [id, genres] of Object.entries(fetched)) {
        genreCache.set(id, genres);
      }
    }

    const withGenres = allAlbums.map((album) => {
      const genres = Array.from(
        new Set(album.artists.flatMap((ar) => genreCache.get(ar.id) ?? [])),
      );
      return { ...album, genres };
    });

    return NextResponse.json(withGenres);
  } catch (error) {
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
