"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 4000;

export function useNowPlaying(enabled: boolean) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [error, setError] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }

    async function poll() {
      try {
        const res = await fetch("/api/now-playing");
        if (!res.ok) {
          setError(true);
          return;
        }
        const json: NowPlayingResponse = await res.json();
        setData(json);
        setError(false);
      } catch {
        setError(true);
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled]);

  return { data, error };
}
