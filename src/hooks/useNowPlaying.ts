"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 10_000;
const ERROR_RETRY_MS = 30_000;
const QUOTA_RETRY_MS = 60_000;

export function useNowPlaying(enabled: boolean) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(false);
      return;
    }

    let active = true;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (!active || document.visibilityState !== "visible") return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void poll();
      }, delay);
    };

    async function poll() {
      if (!active || document.visibilityState !== "visible") return;

      try {
        const res = await fetch("/api/now-playing", {
          cache: "no-store",
        });

        if (!res.ok) {
          if (active) setError(true);

          if (res.status === 429) {
            const retryAfter = Number(res.headers.get("retry-after") ?? "");
            const retryMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : QUOTA_RETRY_MS;
            schedule(retryMs);
          } else {
            schedule(ERROR_RETRY_MS);
          }

          return;
        }

        const json: NowPlayingResponse = await res.json();

        if (!active) return;
        setData(json);
        setError(false);
        schedule(POLL_INTERVAL_MS);
      } catch {
        if (active) {
          setError(true);
          schedule(ERROR_RETRY_MS);
        }
      }
    }

    const handleVisibility = () => {
      clearTimer();

      if (document.visibilityState === "visible") {
        void poll();
      }
    };

    void poll();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  return { data, error };
}
