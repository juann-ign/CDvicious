"use client";

import { useSyncExternalStore } from "react";
import type { AlbumItem } from "@/types/crate";

type CollectionSnapshot = {
  albums: AlbumItem[] | null;
  genresLoaded: boolean;
};

const EMPTY_SNAPSHOT: CollectionSnapshot = {
  albums: null,
  genresLoaded: false,
};

let snapshot = EMPTY_SNAPSHOT;
let basePromise: Promise<AlbumItem[]> | null = null;
let genresPromise: Promise<AlbumItem[]> | null = null;
let cacheGeneration = 0;
let lastAuthenticated: boolean | null = null;
const listeners = new Set<() => void>();

function publish(albums: AlbumItem[], genresLoaded: boolean) {
  snapshot = { albums, genresLoaded };
  listeners.forEach((listener) => listener());
}

async function fetchCollection(includeGenres: boolean) {
  const query = includeGenres ? "?includeGenres=1" : "?includeGenres=0";
  const res = await fetch("/api/collection" + query, {
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as {
      reason?: string;
      error?: string;
    } | null;

    const error = new Error(
      body?.error ?? body?.reason ?? `collection request failed: ${res.status}`,
    ) as Error & { status?: number; reason?: string };

    error.status = res.status;
    error.reason = body?.reason;
    throw error;
  }

  const data = (await res.json()) as unknown;

  if (!Array.isArray(data)) {
    throw new Error("invalid collection response");
  }

  return data as AlbumItem[];
}

export function syncCollectionAuth(authenticated: boolean | null) {
  if (authenticated === false && lastAuthenticated !== false) {
    cacheGeneration += 1;
    snapshot = EMPTY_SNAPSHOT;
    basePromise = null;
    genresPromise = null;
    listeners.forEach((listener) => listener());
  }

  lastAuthenticated = authenticated;
}

export function loadCollection(authenticated: boolean | null) {
  if (authenticated !== true) {
    return null;
  }

  if (snapshot.albums) {
    return Promise.resolve(snapshot.albums);
  }

  if (basePromise) {
    return basePromise;
  }

  const generation = cacheGeneration;
  const promise = fetchCollection(false)
    .then((albums) => {
      if (generation === cacheGeneration) {
        publish(albums, false);
      }
      return albums;
    })
    .finally(() => {
      if (basePromise === promise) {
        basePromise = null;
      }
    });

  basePromise = promise;
  return promise;
}

export function loadCollectionGenres(authenticated: boolean | null) {
  if (authenticated !== true) {
    return null;
  }

  if (snapshot.genresLoaded && snapshot.albums) {
    return Promise.resolve(snapshot.albums);
  }

  if (genresPromise) {
    return genresPromise;
  }

  const ensureBase = snapshot.albums
    ? Promise.resolve(snapshot.albums)
    : loadCollection(authenticated);

  if (!ensureBase) {
    return null;
  }

  const generation = cacheGeneration;
  const promise = ensureBase
    .then(() => {
      if (generation !== cacheGeneration) {
        throw new Error("collection auth changed");
      }
      return fetchCollection(true);
    })
    .then((albums) => {
      if (generation === cacheGeneration) {
        publish(albums, true);
      }
      return albums;
    })
    .finally(() => {
      if (genresPromise === promise) {
        genresPromise = null;
      }
    });

  genresPromise = promise;
  return promise;
}

export function useCollectionCache() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY_SNAPSHOT,
  );
}
