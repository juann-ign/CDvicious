"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogError, fetchCatalogPage } from "@/lib/catalogClient";
import type { ArtistRelease, ReleaseGroup } from "@/types/artist";

type Catalog = { items: ArtistRelease[]; nextOffset: number | null; total: number; error: CatalogError | null };
const emptyCatalog = (): Catalog => ({ items: [], nextOffset: 0, total: 0, error: null });
export function useArtistCatalog(artistId: string | undefined, group: ReleaseGroup, active: boolean) {
  const cache = useRef(new Map<string, Catalog>());
  const [, setRevision] = useState(0);
  const [retry, setRetry] = useState(0);
  const key = `${artistId}:${group}`;
  const current = cache.current.get(key) ?? emptyCatalog();

  useEffect(() => {
    if (!artistId || !active) return;
    const controller = new AbortController();
    let cancelled = false;
    const publish = (value: Catalog) => {
      if (cancelled) return;
      cache.current.set(key, value);
      setRevision((value) => value + 1);
    };
    void (async () => {
      let state = cache.current.get(key) ?? emptyCatalog();
      if (state.error) return;
      try {
        while (state.nextOffset !== null && !cancelled) {
          const offset = state.nextOffset;
          const page = await fetchCatalogPage<ArtistRelease>(`/api/artists/${encodeURIComponent(artistId)}/albums?group=${group}&offset=${offset}`, controller.signal);
          if (cancelled) return;
          if (page.nextOffset !== null && page.nextOffset <= offset) throw new CatalogError(502);
          const byId = new Map(state.items.map((item) => [item.id, item]));
          for (const item of page.items) {
            if (item.album_group === "appears_on") continue;
            byId.set(item.id, item);
          }
          state = { items: [...byId.values()].sort((a, b) => (a.release_date ?? "9999").localeCompare(b.release_date ?? "9999") || a.id.localeCompare(b.id)), nextOffset: page.nextOffset, total: page.total, error: null };
          publish(state);
        }
      } catch (error) {
        if (!cancelled) publish({ ...state, error: error instanceof CatalogError ? error : new CatalogError(0) });
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [artistId, group, key, active, retry]);

  return {
    ...current,
    loading: active && current.nextOffset !== null && !current.error,
    retry: () => {
      if (current.error?.status === 429 && Date.now() < current.error.retryAt) return;
      cache.current.set(key, { ...current, error: null });
      setRetry((value) => value + 1);
    },
  };
}
