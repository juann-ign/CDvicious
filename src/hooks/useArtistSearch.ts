"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogError, fetchCatalogPage } from "@/lib/catalogClient";
import type { ArtistItem, CatalogPage } from "@/types/artist";

export function useArtistSearch(active: boolean, includeReleases = false) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<CatalogPage<ArtistItem> | null>(null);
  const [error, setError] = useState<CatalogError | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const completed = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !query.trim()) return;
    const key = JSON.stringify([query.trim(), offset, includeReleases]);
    if (completed.current === key) return;
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ type: "artist", q: query.trim(), offset: String(offset) });
      if (includeReleases) params.set("scope", "releases");
      void fetchCatalogPage<ArtistItem>(`/api/search?${params}`, controller.signal)
        .then((data) => { if (!cancelled) { completed.current = key; setResult(data); } })
        .catch((reason) => { if (!cancelled) setError(reason instanceof CatalogError ? reason : new CatalogError(0)); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); controller.abort(); };
  }, [active, query, offset, retry, includeReleases]);
  return { query, offset, result, error, loading,
    changeQuery: (value: string) => { completed.current = null; setQuery(value); setOffset(0); setResult(null); setError(null); setLoading(false); },
    changePage: (value: number) => { completed.current = null; setOffset(value); setResult(null); setLoading(false); },
    retry: () => { if (error?.status !== 429 || Date.now() >= error.retryAt) { completed.current = null; setRetry((value) => value + 1); } },
  };
}
