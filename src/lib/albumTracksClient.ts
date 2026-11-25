import type { AlbumTrack } from "@/types/crate";

export type AlbumTracksError = { status: number; retryAt: number; quotaExceeded?: boolean };
export type AlbumTracksResult = { tracks: AlbumTrack[]; error: null } | { tracks: null; error: AlbumTracksError };

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 32;
const FALLBACK_BACKOFF_MS = 30 * 1000;
const cache = new Map<string, { tracks: AlbumTrack[]; expiresAt: number }>();
const pending = new Map<string, { controller: AbortController; promise: Promise<AlbumTracksResult> }>();
let cooldown: AlbumTracksError | undefined;
let authenticated: boolean | null = null;

export function syncAlbumTracksAuth(active: boolean | null) {
  if (active === false && authenticated !== false) {
    for (const { controller } of pending.values()) controller.abort();
    pending.clear();
    cache.clear();
    cooldown = undefined;
  }
  authenticated = active;
}

function backoffUntil(header: string | null) {
  const value = header?.trim() ?? "";
  const now = Date.now();
  const retryAt = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return retryAt > now && retryAt < 8.64e15 ? retryAt : now + FALLBACK_BACKOFF_MS;
}

async function fetchAlbumTracks(albumId: string, controller: AbortController): Promise<AlbumTracksResult> {
  try {
    const response = await fetch(`/api/album/${encodeURIComponent(albumId)}/tracks`, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      const error = { status: response.status, retryAt: 0, quotaExceeded: false };
      if (response.status === 401 && !controller.signal.aborted) syncAlbumTracksAuth(false);
      if (response.status === 429) {
        const body = await response.json().catch(() => null) as { reason?: string } | null;
        error.retryAt = backoffUntil(response.headers.get("retry-after"));
        error.quotaExceeded = body?.reason === "QUOTA_EXCEEDED";
        if (!controller.signal.aborted && (!cooldown || error.retryAt >= cooldown.retryAt)) cooldown = error;
      }
      return { tracks: null, error };
    }
    const data = await response.json() as { tracks?: AlbumTrack[] } | null;
    if (!Array.isArray(data?.tracks)) return { tracks: null, error: { status: 502, retryAt: 0 } };
    if (!controller.signal.aborted) {
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(albumId, { tracks: data.tracks, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return { tracks: data.tracks, error: null };
  } catch {
    return { tracks: null, error: { status: authenticated === false ? 401 : 0, retryAt: 0 } };
  }
}

export function loadAlbumTracks(albumId: string): Promise<AlbumTracksResult> {
  if (authenticated === false) return Promise.resolve({ tracks: null, error: { status: 401, retryAt: 0 } });
  const cached = cache.get(albumId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve({ tracks: cached.tracks, error: null });
  cache.delete(albumId);
  const request = pending.get(albumId);
  if (request) return request.promise;
  if (cooldown && cooldown.retryAt > Date.now()) return Promise.resolve({ tracks: null, error: cooldown });

  const controller = new AbortController();
  const promise = fetchAlbumTracks(albumId, controller).finally(() => {
    if (pending.get(albumId)?.controller === controller) pending.delete(albumId);
  });
  pending.set(albumId, { controller, promise });
  return promise;
}

export function canRetryAlbumTracks(error: AlbumTracksError | null, now = Date.now()) {
  return Boolean(error && error.status !== 401 && error.status !== 403 && error.retryAt <= now);
}

export function albumTracksErrorMessage(error: AlbumTracksError | null, now = Date.now()) {
  if (error?.status === 401) return "Tu sesión de Spotify venció. Volvé a conectar tu cuenta.";
  if (error?.status === 403) return "Spotify restringió el acceso a las pistas de esta edición.";
  if (error?.status !== 429) return null;
  if (error.retryAt <= now) return "Spotify limitó la carga de pistas. Podés reintentar.";
  const retryTime = new Intl.DateTimeFormat("es-AR", {
    ...(error.retryAt - now > 24 * 60 * 60 * 1000 ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit", minute: "2-digit",
  }).format(error.retryAt);
  return `${error.quotaExceeded ? "Spotify agotó la cuota de pistas." : "Spotify limitó la carga de pistas."} Reintento disponible desde ${retryTime}.`;
}
