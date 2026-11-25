"use client";

import { useEffect, useRef, useState } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import type { LyricsResponse } from "@/types/lyrics";
import { parseLyricsResponse } from "@/lib/lyrics";

type State = LyricsResponse & { key: string | null; loading: boolean; retryAt?: number };
const initial: State = { key: null, loading: false, status: "unavailable", lyrics: null, provenance: { provider: "lrclib" } };
export function lyricsRequestKey(track: SpotifyTrack | null): string | null {
  return track ? JSON.stringify([track.id, track.name, track.artists[0]?.name ?? "", track.album.name, Number.isFinite(track.duration_ms) && track.duration_ms > 0 ? Math.round(track.duration_ms / 1000) : null]) : null;
}
export function useLyrics(track: SpotifyTrack | null) {
  const key = lyricsRequestKey(track);
  const artist = track?.artists[0]?.name ?? "";
  const title = track?.name ?? "";
  const album = track?.album.name ?? "";
  const duration = track && Number.isFinite(track.duration_ms) && track.duration_ms > 0 ? Math.round(track.duration_ms / 1000) : undefined;
  const [state, setState] = useState<State>(initial);
  const [revision, setRevision] = useState(0);
  const [, setRetryReady] = useState(0);
  const cache = useRef(new Map<string, LyricsResponse>());
  const sequence = useRef(0);
  useEffect(() => {
    const requestSequence = ++sequence.current;
    if (!key) { setState(initial); return; }
    if (!artist.trim() || !title.trim()) { setState({ ...initial, key }); return; }
    const saved = cache.current.get(key);
    if (saved) { setState({ ...saved, key, loading: false }); return; }
    const controller = new AbortController();
    let cancelled = false;
    setState({ ...initial, key, loading: true });
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const query = new URLSearchParams({ artist, title, album });
    if (duration !== undefined) query.set("duration", String(duration));
    void fetch(`/api/lyrics?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body: unknown = await response.json();
        const result = parseLyricsResponse(body);
        if (cancelled || requestSequence !== sequence.current) return;
        if (!response.ok || result.status === "error") {
          const retryAfter = Number(response.headers.get("Retry-After"));
          setState({ ...initial, key, status: "error", error: result.error ?? "No se pudo cargar la letra. Podés volver a intentarlo.", retryAt: Number.isFinite(retryAfter) && retryAfter > 0 ? Date.now() + retryAfter * 1000 : undefined });
          return;
        }
        cache.current.set(key, result);
        setState({ ...result, key, loading: false });
      })
      .catch(() => {
        if (!cancelled && requestSequence === sequence.current) setState({ ...initial, key, status: "error", error: controller.signal.aborted ? "La consulta de letras tardó demasiado. Podés volver a intentarlo." : "No se pudo cargar la letra. Revisá la conexión e intentá de nuevo." });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [key, artist, title, album, duration, revision]);
  const current = state.key === key ? state : { ...initial, key, loading: Boolean(key) };
  useEffect(() => {
    if (!current.retryAt || current.retryAt <= Date.now()) return;
    const timer = window.setTimeout(() => setRetryReady((value) => value + 1), current.retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [current.retryAt]);
  return {
    ...current,
    retryBlocked: Boolean(current.retryAt && current.retryAt > Date.now()),
    retry: () => { if (!current.retryAt || current.retryAt <= Date.now()) setRevision((value) => value + 1); },
  };
}
