"use client";

import { useCallback, useEffect, useState } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { albumTracksErrorMessage, canRetryAlbumTracks, loadAlbumTracks, syncAlbumTracksAuth, type AlbumTracksResult } from "@/lib/albumTracksClient";

type Result = { albumId: string; request: number; value: AlbumTracksResult };

export function useAlbumTracks(albumId: string | null | undefined, enabled = true) {
  const { authenticated } = useSpotifyPlayer();
  const [request, setRequest] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [clock, setClock] = useState(Date.now);
  const current = authenticated === true && result?.albumId === albumId && result?.request === request ? result : null;
  const trackError = current?.value.error ?? (authenticated === false ? { status: 401, retryAt: 0 } : null);
  const loading = Boolean(enabled && albumId && !current && authenticated !== false);
  const retryAt = trackError?.retryAt ?? 0;
  const retry = useCallback(() => {
    if (canRetryAlbumTracks(trackError)) setRequest((value) => value + 1);
  }, [trackError]);

  useEffect(() => {
    syncAlbumTracksAuth(authenticated);
    if (authenticated === false) setResult(null);
  }, [authenticated]);

  useEffect(() => {
    if (!loading || !albumId || authenticated !== true) return;
    let cancelled = false;
    void loadAlbumTracks(albumId).then((value) => {
      if (!cancelled) setResult({ albumId, request, value });
    });
    // The shared request can populate the cache for the next consumer.
    return () => { cancelled = true; };
  }, [albumId, authenticated, loading, request]);

  useEffect(() => {
    const remaining = retryAt - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(remaining + 1, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [retryAt, clock]);

  return {
    tracks: current?.value.tracks ?? null,
    loading,
    error: Boolean(trackError),
    errorMessage: albumTracksErrorMessage(trackError),
    canRetry: canRetryAlbumTracks(trackError),
    rateLimited: trackError?.status === 429,
    retry,
  };
}
