import { createHash } from "node:crypto";
import { normalizeGenres } from "./collectionFilters";
import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
  SPOTIFY_SCOPES,
  SPOTIFY_NOW_PLAYING_URL,
  SPOTIFY_ME_URL,
  SPOTIFY_ARTISTS_BATCH,
  SPOTIFY_ARTISTS_URL,
} from "./constants";

type CircuitEntry = {
  blockedUntil: number;
  reason?: string;
};

const spotifyCircuit = new Map<string, CircuitEntry>();

function circuitKey(endpoint: string, accessToken: string) {
  const tokenHash = createHash("sha256").update(accessToken).digest("hex");
  return endpoint + ":" + tokenHash;
}

function parseRetryAfterSeconds(value: string | null) {
  const raw = value?.trim();
  if (!raw || !/^\d+$/.test(raw)) return undefined;

  const seconds = Number(raw);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

function circuitResponse(blockedUntil: number, reason?: string) {
  const remaining = Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000));

  return new Response(
    JSON.stringify({
      error: {
        status: 429,
        message: "Too many requests",
        reason: reason ?? "RATE_LIMITED",
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(remaining),
      },
    },
  );
}

export async function fetchSpotifyWebApi(
  accessToken: string,
  endpoint: string,
  input: string | URL,
  init?: RequestInit,
) {
  const key = circuitKey(endpoint, accessToken);
  const current = spotifyCircuit.get(key);

  if (current) {
    if (Date.now() < current.blockedUntil) {
      return circuitResponse(current.blockedUntil, current.reason);
    }

    spotifyCircuit.delete(key);
  }

  const res = await fetch(input, init);

  if (res.status === 429) {
    const retryAfterRaw = res.headers.get("retry-after");
    const retryAfterSeconds = parseRetryAfterSeconds(retryAfterRaw);

    if (retryAfterSeconds !== undefined) {
      const clone = res.clone();
      let reason: string | undefined;

      try {
        const body = (await clone.json()) as {
          error?: { reason?: string };
        };
        reason = body.error?.reason;
      } catch {
        reason = undefined;
      }

      spotifyCircuit.set(key, {
        blockedUntil: Date.now() + retryAfterSeconds * 1000,
        reason,
      });

      if (process.env.NODE_ENV !== "production") {
        console.warn("[Spotify circuit open]", {
          endpoint,
          reason: reason ?? null,
          retryAfterRaw,
          retryAfterSeconds,
        });
      }
    }
  } else if (res.ok) {
    spotifyCircuit.delete(key);
  }

  return res;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
    public readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

function parseSpotifyError(body: string): {
  reason?: string;
} {
  try {
    const data = JSON.parse(body) as {
      error?: { reason?: string };
    };
    return { reason: data.error?.reason };
  } catch {
    return {};
  }
}

function readRetryAfter(res: Response, endpoint: string, reason?: string) {
  const raw = res.headers.get("retry-after")?.trim() ?? undefined;
  const seconds =
    raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : undefined;

  if (res.status === 429 && process.env.NODE_ENV !== "production") {
    console.warn("[Spotify 429]", {
      endpoint,
      reason: reason ?? null,
      retryAfterRaw: raw ?? null,
      retryAfterSeconds: seconds ?? null,
    });
  }

  return raw;
}

export function buildAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader() {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });

  if (!res.ok) throw new Error(`spotify token exchange failed: ${res.status}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`spotify token refresh failed: ${res.status}`);
  return res.json() as Promise<{
    access_token: string;
    expires_in: number;
  }>;
}

export async function fetchNowPlaying(accessToken: string) {
  const res = await fetchSpotifyWebApi(
    accessToken,
    "GET /v1/me/player",
    SPOTIFY_NOW_PLAYING_URL,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (res.status === 204) {
    return {
      isPlaying: false,
      progressMs: null,
      durationMs: null,
      track: null,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    const { reason } = parseSpotifyError(body);

    if (res.status === 401) {
      const err = new Error("spotify_unauthorized");
      err.name = "SpotifyUnauthorizedError";
      throw err;
    }

    throw new SpotifyApiError(
      `spotify now-playing failed: ${res.status}`,
      res.status,
      reason,
      res.headers.get("retry-after") ?? undefined,
    );
  }

  const data = await res.json();

  return {
    isPlaying: Boolean(data.is_playing),
    sampledAt: Date.now(),
    deviceId: data.device?.id,
    progressMs: typeof data.progress_ms === "number" ? data.progress_ms : null,
    durationMs: data.item?.duration_ms ?? null,
    track: data.item
      ? {
          id: data.item.id,
          name: data.item.name,
          artists: data.item.artists,
          album: data.item.album,
          duration_ms: data.item.duration_ms,
        }
      : null,
  };
}

export async function fetchUserProfile(accessToken: string) {
  const res = await fetchSpotifyWebApi(
    accessToken,
    "GET /v1/me",
    SPOTIFY_ME_URL,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const body = await res.text();
    const { reason } = parseSpotifyError(body);

    throw new SpotifyApiError(
      `spotify me failed: ${res.status}`,
      res.status,
      reason,
      readRetryAfter(res, "GET /v1/me", reason),
    );
  }

  const data = await res.json();

  return {
    displayName: data.display_name ?? "Usuario Spotify",
    avatarUrl: data.images?.[0]?.url ?? null,
  };
}

export interface ArtistGenresResult {
  byArtist: Record<string, string[]>;
  requestedArtistIds: string[];
  unresolvedArtistIds: string[];
  unavailableArtistIds: string[];
  error?: SpotifyApiError;
}

const artistGenreCache = new Map<string, { genres: string[]; expiresAt: number }>();
const unavailableArtistBatch = new Map<string, number>();
const unavailableArtistGenres = new Map<string, number>();
const ARTIST_GENRES_TTL_MS = 10 * 60 * 1000;
const MAX_INDIVIDUAL_GENRE_REQUESTS = 50;

export async function fetchArtistGenresDetailed(
  accessToken: string,
  artistIds: string[],
  options: { individual?: boolean; refreshUnavailable?: boolean; signal?: AbortSignal } = {},
): Promise<ArtistGenresResult> {
  const unique = Array.from(new Set(artistIds)).filter(Boolean);
  const map: Record<string, string[]> = Object.create(null);
  const identity = createHash("sha256").update(accessToken).digest("hex");
  const keyFor = (id: string) => `${identity}:${id}`;
  const unavailable = new Set<string>();
  for (const id of unique) {
    const entry = artistGenreCache.get(keyFor(id));
    if (entry && entry.expiresAt > Date.now()) map[id] = entry.genres;
    else if (entry) artistGenreCache.delete(keyFor(id));
    const absentUntil = unavailableArtistGenres.get(keyFor(id)) ?? 0;
    if (options.refreshUnavailable || absentUntil <= Date.now()) unavailableArtistGenres.delete(keyFor(id));
    else if (!(id in map)) unavailable.add(id);
  }
  const remaining = unique.filter((id) => !(id in map) && !unavailable.has(id));
  let error: SpotifyApiError | undefined;
  let individual = options.individual === true || (unavailableArtistBatch.get(identity) ?? 0) > Date.now();
  let individualRequests = 0;
  const record = (artist: { id?: string; genres?: unknown[] } | null, requested: string[]) => {
    if (!artist?.id || !requested.includes(artist.id)) return;
    if (!Object.hasOwn(artist, "genres")) {
      unavailable.add(artist.id);
      unavailableArtistGenres.set(keyFor(artist.id), Date.now() + ARTIST_GENRES_TTL_MS);
      return;
    }
    if (!Array.isArray(artist.genres) || !artist.genres.every((genre) => typeof genre === "string")) {
      error ??= new SpotifyApiError("artist genre response is malformed", 502, "INVALID_ARTIST_RESPONSE");
      return;
    }
    const genres = normalizeGenres(artist.genres);
    map[artist.id] = genres;
    artistGenreCache.set(keyFor(artist.id), { genres, expiresAt: Date.now() + ARTIST_GENRES_TTL_MS });
    unavailableArtistGenres.delete(keyFor(artist.id));
  };
  const failure = async (response: Response) => {
    const { reason } = parseSpotifyError(await response.text());
    const next = new SpotifyApiError("spotify artist genres failed", response.status, reason, response.headers.get("retry-after") ?? undefined);
    if (!error || next.status === 401 || next.status === 429) error = next;
  };
  for (let offset = 0; offset < remaining.length; offset += SPOTIFY_ARTISTS_BATCH) {
    const batch = remaining.slice(offset, offset + SPOTIFY_ARTISTS_BATCH);
    try {
      if (!individual) {
        const response = await fetchSpotifyWebApi(accessToken, "GET /v1/artists", `${SPOTIFY_ARTISTS_URL}?ids=${batch.join(",")}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: options.signal });
        // Development mode no longer provides Get Several Artists. Only that
        // unsupported batch response enables a bounded individual fallback.
        if (response.status === 403 || response.status === 404) {
          individual = true;
          unavailableArtistBatch.set(identity, Date.now() + ARTIST_GENRES_TTL_MS);
        }
        else if (!response.ok) { await failure(response); if (response.status === 401 || response.status === 429) break; continue; }
        else {
          const data = await response.json();
          for (const artist of data.artists ?? []) record(artist, batch);
          continue;
        }
      }
      for (const id of batch) {
        if (individualRequests >= MAX_INDIVIDUAL_GENRE_REQUESTS) {
          error ??= new SpotifyApiError("artist genre coverage is incomplete", 503, "INCOMPLETE_COVERAGE");
          break;
        }
        individualRequests++;
        const response = await fetchSpotifyWebApi(accessToken, "GET /v1/artists/{id}", `${SPOTIFY_ARTISTS_URL}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: options.signal });
        if (!response.ok) { await failure(response); if (response.status === 401 || response.status === 429) break; continue; }
        record(await response.json(), [id]);
      }
      if (individualRequests >= MAX_INDIVIDUAL_GENRE_REQUESTS || error?.status === 401 || error?.status === 429) break;
    } catch (cause) {
      if (options.signal?.aborted) throw cause;
      error ??= new SpotifyApiError("artist genres could not be read", 502, "NETWORK_ERROR");
    }
  }
  const unresolvedArtistIds = unique.filter((id) => !(id in map));
  if (unresolvedArtistIds.some((id) => !unavailable.has(id)) && !error) error = new SpotifyApiError("artist genres missing from response", 502, "INCOMPLETE_COVERAGE");
  return { byArtist: map, requestedArtistIds: unique, unresolvedArtistIds, unavailableArtistIds: [...unavailable], error };
}

// Retain the map contract for existing callers. Callers that can present partial
// coverage use the detailed variant rather than treating missing data as empty.
export async function fetchArtistGenres(accessToken: string, artistIds: string[]): Promise<Record<string, string[]>> {
  const result = await fetchArtistGenresDetailed(accessToken, artistIds);
  if (result.error && !Object.keys(result.byArtist).length) throw result.error;
  if (result.unavailableArtistIds.length && !Object.keys(result.byArtist).length) throw new SpotifyApiError("Spotify did not provide artist genres", 503, "GENRES_UNAVAILABLE");
  return result.byArtist;
}
