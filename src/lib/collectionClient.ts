"use client";

import { useSyncExternalStore } from "react";
import type { AlbumItem } from "@/types/crate";
import { isCollectionAlbum, normalizeCollectionAlbum, normalizeGenres } from "./collectionFilters";

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";
export type GenreLoadState = LoadState | "partial" | "unavailable";
export type CollectionSnapshot = {
  albums: AlbumItem[] | null;
  genresLoaded: boolean;
  collectionState: LoadState;
  collectionError: CollectionRequestError | null;
  collectionRetryAt: number;
  genresState: GenreLoadState;
  genresError: CollectionRequestError | null;
  genresRetryAt: number;
  genresResolvedArtists: number;
  genresTotalArtists: number;
};

export class CollectionRequestError extends Error {
  constructor(message: string, readonly status = 0, readonly reason?: string, readonly retryAt = 0) { super(message); }
}

const EMPTY_SNAPSHOT: CollectionSnapshot = {
  albums: null, genresLoaded: false, collectionState: "idle", collectionError: null, collectionRetryAt: 0,
  genresState: "idle", genresError: null, genresRetryAt: 0, genresResolvedArtists: 0, genresTotalArtists: 0,
};
let snapshot = EMPTY_SNAPSHOT;
let basePromise: Promise<AlbumItem[]> | null = null;
let genresPromise: Promise<AlbumItem[]> | null = null;
let cacheGeneration = 0;
let lastAuthenticated: boolean | null = null;
const listeners = new Set<() => void>();

function publish(changes: Partial<CollectionSnapshot>) {
  snapshot = { ...snapshot, ...changes };
  listeners.forEach((listener) => listener());
}
function retryTime(value: string | null): number {
  if (!value) return 0;
  if (/^\d+$/.test(value.trim())) return Date.now() + Number(value) * 1000;
  return Math.max(Date.now(), Date.parse(value) || 0);
}
function requestError(error: unknown) {
  return error instanceof CollectionRequestError ? error : new CollectionRequestError("No se pudo conectar con Spotify. Revisá tu conexión y reintentá.");
}
function errorMessage(status: number) {
  if (status === 401) return "Tu sesión de Spotify venció. Volvé a conectar tu cuenta.";
  if (status === 403) return "Spotify no permitió consultar estos datos. Revisá los permisos de la cuenta.";
  if (status === 429) return "Spotify limitó las consultas. Esperá antes de reintentar.";
  return "No se pudieron consultar los datos de Spotify. Podés reintentar.";
}
async function fetchCollection(includeGenres: boolean, retry = false) {
  const response = await fetch(`/api/collection?includeGenres=${includeGenres ? "1" : "0"}${retry ? "&retry=1" : ""}`, { cache: "no-store" });
  const retryAt = retryTime(response.headers.get("Retry-After"));
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; reason?: string } | null;
    throw new CollectionRequestError(errorMessage(response.status), response.status, body?.reason ?? body?.error, retryAt);
  }
  const data = await response.json() as unknown;
  if (!Array.isArray(data) || !data.every(isCollectionAlbum)) throw new CollectionRequestError("La respuesta de la colección no es válida.", 502);
  const albums: AlbumItem[] = data.map(normalizeCollectionAlbum);
  const headerState = response.headers.get("X-CDV-Genres-State");
  const known = albums.filter((album) => album.genreMetadata?.state === "complete").length;
  const anyGenres = albums.some((album) => album.genres?.length);
  const permitted = new Set(["not-requested", "complete", "empty", "unavailable", "partial", "error"]);
  let state = headerState === null ? (known === albums.length ? anyGenres ? "complete" : "empty" : anyGenres ? "partial" : "error")
    : permitted.has(headerState) ? headerState : "error";
  if (state === "complete" && !anyGenres) state = "empty";
  if (state === "empty" && anyGenres) state = "error";
  return { albums, state, retryAt,
    resolved: Number(response.headers.get("X-CDV-Genres-Resolved-Artists")) || 0,
    total: Number(response.headers.get("X-CDV-Genres-Total-Artists")) || 0,
    status: Number(response.headers.get("X-CDV-Genres-Error-Status")) || 502 };
}

export function syncCollectionAuth(authenticated: boolean | null) {
  if (authenticated === false && lastAuthenticated !== false) {
    cacheGeneration++;
    snapshot = EMPTY_SNAPSHOT; basePromise = null; genresPromise = null;
    listeners.forEach((listener) => listener());
  }
  lastAuthenticated = authenticated;
}

export function loadCollection(authenticated: boolean | null) {
  if (authenticated !== true) return null;
  if (snapshot.albums) return Promise.resolve(snapshot.albums);
  if (basePromise) return basePromise;
  if (snapshot.collectionRetryAt > Date.now()) return Promise.reject(snapshot.collectionError);
  const generation = cacheGeneration;
  publish({ collectionState: "loading", collectionError: null });
  const promise = fetchCollection(false).then(({ albums }) => {
    if (generation === cacheGeneration) publish({ albums, collectionState: albums.length ? "ready" : "empty", collectionRetryAt: 0 });
    return albums;
  }).catch((error: unknown) => {
    const failure = requestError(error);
    if (generation === cacheGeneration) publish({ collectionState: "error", collectionError: failure, collectionRetryAt: failure.retryAt });
    throw failure;
  }).finally(() => { if (basePromise === promise) basePromise = null; });
  basePromise = promise;
  return promise;
}

export function loadCollectionGenres(authenticated: boolean | null, retry = false) {
  if (authenticated !== true) return null;
  if (!retry && snapshot.genresLoaded && snapshot.albums) return Promise.resolve(snapshot.albums);
  if (genresPromise) return genresPromise;
  if (snapshot.genresRetryAt > Date.now()) return Promise.reject(snapshot.genresError);
  if (snapshot.albums?.length === 0) {
    publish({ genresState: "empty", genresLoaded: true, genresError: null });
    return Promise.resolve(snapshot.albums);
  }
  const ensureBase = snapshot.albums ? Promise.resolve(snapshot.albums) : loadCollection(authenticated);
  if (!ensureBase) return null;
  const generation = cacheGeneration;
  publish({ genresState: "loading", genresError: null });
  const promise = ensureBase.then(() => {
    if (generation !== cacheGeneration) throw new CollectionRequestError("La sesión cambió.");
    return fetchCollection(true, retry);
  }).then((result) => {
    if (result.state === "error" || result.state === "not-requested") throw new CollectionRequestError(errorMessage(result.status), result.status, undefined, result.retryAt);
    if (generation === cacheGeneration) {
      const incoming = new Map(result.albums.map((album) => [album.id, album]));
      // Enrich the current catalog by ID; a cached enrichment response must not
      // replace its order, edition metadata or membership with an older catalog.
      const albums = (snapshot.albums ?? []).map((album) => {
        const metadata = incoming.get(album.id);
        if (!metadata) return album;
        return { ...album, genreMetadata: metadata.genreMetadata,
          genres: result.state === "partial" && metadata.genreMetadata?.state !== "complete"
            ? normalizeGenres([...(album.genres ?? []), ...(metadata.genres ?? [])]) : metadata.genres };
      });
      const incomplete = albums.some((album) => !incoming.has(album.id));
      const genresState: GenreLoadState = result.state === "partial" || incomplete ? "partial" : result.state === "unavailable" ? "unavailable" : result.state === "empty" ? "empty" : "ready";
      publish({ albums, genresState, genresLoaded: genresState === "ready" || genresState === "empty" || genresState === "unavailable", genresResolvedArtists: result.resolved, genresTotalArtists: result.total,
        genresRetryAt: result.retryAt, genresError: genresState === "partial" ? new CollectionRequestError("La consulta de géneros está incompleta.", result.status, undefined, result.retryAt) : null });
    }
    return result.albums;
  }).catch((error: unknown) => {
    const failure = requestError(error);
    if (generation === cacheGeneration) publish({ genresState: "error", genresLoaded: false, genresError: failure, genresRetryAt: failure.retryAt });
    throw failure;
  }).finally(() => { if (genresPromise === promise) genresPromise = null; });
  genresPromise = promise;
  return promise;
}

export function useCollectionCache() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => EMPTY_SNAPSHOT);
}
