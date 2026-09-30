"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 10_000;

export function useNowPlaying(enabled: boolean) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(false);
      return;
    }

    let active = true;

    async function poll() {
      if (document.visibilityState !== "visible") return;

      try {
        const res = await fetch("/api/now-playing", {
          cache: "no-store",
        });

        if (!res.ok) {
          if (active) setError(true);
          return;
        }

        const json: NowPlayingResponse = await res.json();

        if (!active) return;
        setData(json);
        setError(false);
      } catch {
        if (active) setError(true);
      }
    }

    const startPolling = () => {
      if (intervalRef.current !== null) return;
      void poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  return { data, error };
}
