"use client";

import { useEffect, useState } from "react";
import { CatalogError, fetchCatalogPage } from "@/lib/catalogClient";
import type { ArtistItem, CatalogPage } from "@/types/artist";

export function useArtistSearch(active: boolean) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<CatalogPage<ArtistItem> | null>(null);
  const [error, setError] = useState<CatalogError | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active || !query.trim()) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void fetchCatalogPage<ArtistItem>(`/api/search?type=artist&q=${encodeURIComponent(query.trim())}&offset=${offset}`, controller.signal)
        .then((data) => { if (!cancelled) setResult(data); })
        .catch((reason) => { if (!cancelled) setError(reason instanceof CatalogError ? reason : new CatalogError(0)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [active, query, offset, retry]);
  return { query, offset, result, error, loading,
    changeQuery: (value: string) => { setQuery(value); setOffset(0); setResult(null); setError(null); },
    changePage: (value: number) => { setOffset(value); setResult(null); },
    retry: () => { if (error?.status !== 429 || Date.now() >= error.retryAt) setRetry((value) => value + 1); },
  };
}
