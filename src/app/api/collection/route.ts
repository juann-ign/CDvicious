import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import mockCollection from "@/mocks/collection.json";
import { cached } from "@/lib/serverCache";
import {
  fetchArtistGenres,
  fetchSpotifyWebApi,
  SpotifyApiError,
} from "@/lib/spotify";

const SPOTIFY_MAX_LIMIT = 50;
const SAFETY_CEILING = 3000;
const COLLECTION_BASE_TTL_MS = 2 * 60 * 1000;
const COLLECTION_GENRES_TTL_MS = 10 * 60 * 1000;

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

  return allAlbums;
}

export async function GET(request: NextRequest) {
  // Dev/testing only: never touch session, server cache, or Spotify in mock mode.
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const includeGenres =
      request.nextUrl.searchParams.get("includeGenres") === "1";

    if (!includeGenres) {
      return NextResponse.json(
        mockCollection.map((album) => ({ ...album, genres: [] })),
      );
    }

    return NextResponse.json(mockCollection);
  }

  const includeGenres =
    request.nextUrl.searchParams.get("includeGenres") === "1";

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const identityHash = cacheKey(session.refreshToken, session.accessToken);
  const baseKey = collectionCacheKey(identityHash, "base");

  try {
    if (!includeGenres) {
      const allAlbums = await cached(
        baseKey,
        COLLECTION_BASE_TTL_MS,
        () => fetchAllAlbums(session.accessToken),
      );

      return NextResponse.json(allAlbums);
    }

    const genresKey = collectionCacheKey(identityHash, "genres");
    const withGenres = await cached(
      genresKey,
      COLLECTION_GENRES_TTL_MS,
      async () => {
        const allAlbums = await cached(
          baseKey,
          COLLECTION_BASE_TTL_MS,
          () => fetchAllAlbums(session.accessToken),
        );

        const allArtistIds = allAlbums.flatMap((album) =>
          album.artists.map((artist) => artist.id),
        );

        const fetched = await fetchArtistGenres(
          session.accessToken,
          allArtistIds,
        );

        return allAlbums.map((album) => {
          const genres = Array.from(
            new Set(
              album.artists.flatMap(
                (artist) => fetched[artist.id] ?? [],
              ),
            ),
          );

          return { ...album, genres };
        });
      },
    );

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
