"use client";

import { useCallback, useEffect, useState } from "react";
import type { AlbumTrack } from "@/types/crate";

type Result = { albumId: string; request: number; tracks: AlbumTrack[] | null; error: boolean };

export function useAlbumTracks(albumId: string | null | undefined, enabled = true) {
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const current = result?.albumId === albumId && result?.request === request ? result : null;
  const loading = Boolean(enabled && albumId && !current);
  const retry = useCallback(() => setRequest((value) => value + 1), []);

  useEffect(() => {
    if (!loading || !albumId) return;
    const controller = new AbortController();
    void fetch(`/api/album/${encodeURIComponent(albumId)}/tracks`, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Tracks unavailable");
        return response.json();
      })
      .then((data: { tracks?: AlbumTrack[] }) => {
        if (!Array.isArray(data.tracks)) throw new Error("Invalid tracklist");
        if (!controller.signal.aborted) setResult({ albumId, request, tracks: data.tracks, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ albumId, request, tracks: null, error: true });
      });
    return () => controller.abort();
  }, [albumId, loading, request]);

  return { tracks: current?.tracks ?? null, loading, error: current?.error ?? false, retry };
}
