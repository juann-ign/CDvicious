"use client";

import { useEffect, useState } from "react";
import { CatalogError, fetchCatalogPage, fetchCatalogSearch } from "@/lib/catalogClient";
import { catalogArtistPreview } from "@/lib/catalogSearch";
import type { CatalogSearchResult } from "@/types/catalogSearch";
import type { AlbumItem } from "@/types/crate";

interface SearchOutcome<T> {
  term: string;
  attempt: number;
  data: T | null;
  error: CatalogError | null;
}

function catalogError(error: unknown) {
  return error instanceof CatalogError ? error : new CatalogError(0);
}

export function useCatalogSearch(query: string, active: boolean) {
  const term = query.trim();
  const enabled = active && Boolean(term);
  const [search, setSearch] = useState<SearchOutcome<CatalogSearchResult> | null>(null);
  const [artistPreview, setArtistPreview] = useState<SearchOutcome<AlbumItem[]> | null>(null);
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const current = enabled && search?.term === term && search.attempt === searchAttempt ? search : null;
  const artistId = current?.data?.kind === "artist" ? current.data.artists[0]?.id : undefined;
  const currentPreview = artistId && artistPreview?.term === artistId && artistPreview.attempt === previewAttempt ? artistPreview : null;

  useEffect(() => {
    if (!enabled) { setSearch(null); return; }
    const controller = new AbortController();
    const publish = (data: CatalogSearchResult | null, error: CatalogError | null) => {
      if (!controller.signal.aborted) setSearch({ term, attempt: searchAttempt, data, error });
    };
    const timer = window.setTimeout(() => {
      void fetchCatalogSearch(term, controller.signal)
        .then((data) => publish(data, null))
        .catch((error: unknown) => publish(null, catalogError(error)));
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [enabled, term, searchAttempt]);

  useEffect(() => {
    if (!artistId) { setArtistPreview(null); return; }
    const controller = new AbortController();
    const publish = (data: AlbumItem[] | null, error: CatalogError | null) => {
      if (!controller.signal.aborted) setArtistPreview({ term: artistId, attempt: previewAttempt, data, error });
    };
    const url = `/api/artists/${encodeURIComponent(artistId)}/albums?group=album&offset=0`;
    void fetchCatalogPage<AlbumItem>(url, controller.signal)
      .then(({ items }) => publish(catalogArtistPreview(items, artistId), null))
      .catch((error: unknown) => publish(null, catalogError(error)));
    return () => controller.abort();
  }, [artistId, previewAttempt]);

  return {
    result: current?.data ?? null,
    error: current?.error ?? null,
    loading: enabled && current === null,
    preview: artistId ? {
      artistId, albums: currentPreview?.data ?? [], error: currentPreview?.error ?? null, loading: currentPreview === null,
    } : null,
    retry: () => {
      if (current?.error) {
        if (current.error.status !== 429 || Date.now() >= current.error.retryAt) setSearchAttempt((attempt) => attempt + 1);
      } else if (currentPreview?.error && (currentPreview.error.status !== 429 || Date.now() >= currentPreview.error.retryAt)) {
        setPreviewAttempt((attempt) => attempt + 1);
      }
    },
  };
}
