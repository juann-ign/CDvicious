"use client";

import { useEffect, useRef, useState } from "react";
import { CatalogError } from "@/lib/catalogClient";
import { fetchArtistGenres } from "@/lib/artistGenreClient";

type GenreLookup = {
  genres: string[];
  state: "idle" | "loading" | "complete" | "empty" | "unavailable" | "error";
  error: CatalogError | null;
};
const empty = (): GenreLookup => ({ genres: [], state: "idle", error: null });

export function useArtistGenres(artistId: string | null | undefined, active: boolean) {
  const cache = useRef(new Map<string, GenreLookup>());
  const [, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const forcedArtist = useRef<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const current = artistId ? cache.current.get(artistId) ?? empty() : empty();
  const waitSeconds = Math.max(0, Math.ceil(((current.error?.retryAt ?? 0) - now) / 1000));

  useEffect(() => {
    if (!artistId || !active) return;
    const previous = cache.current.get(artistId) ?? empty();
    if (["complete", "empty", "unavailable", "error"].includes(previous.state)) return;
    const controller = new AbortController();
    let cancelled = false;
    const publish = (value: GenreLookup) => {
      if (cancelled) return;
      cache.current.set(artistId, value);
      setRevision((value) => value + 1);
    };
    publish({ ...previous, state: "loading", error: null });
    const explicitRetry = forcedArtist.current === artistId;
    forcedArtist.current = null;
    void fetchArtistGenres(artistId, controller.signal, explicitRetry).then((result) => {
      publish({ genres: result.genres, state: result.state === "error" ? "error" : result.state, error: null });
    }).catch((cause: unknown) => {
      if (cancelled) return;
      publish({ ...previous, state: "error", error: cause instanceof CatalogError ? cause : new CatalogError(0) });
      setNow(Date.now());
    });
    return () => { cancelled = true; controller.abort(); };
  }, [artistId, active, attempt]);

  useEffect(() => {
    if (!active || !current.error?.retryAt || current.error.retryAt <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [artistId, active, current.error?.retryAt]);

  return {
    genres: current.genres,
    state: active ? current.state : "idle" as const,
    error: current.error,
    waitSeconds,
    retry: () => {
      if (!artistId || !active || (current.error?.retryAt ?? 0) > Date.now()) return;
      cache.current.set(artistId, { ...current, state: "idle", error: null });
      forcedArtist.current = artistId;
      setNow(Date.now());
      setAttempt((value) => value + 1);
    },
  };
}
