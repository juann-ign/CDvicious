"use client";

import { useEffect, useRef, useState } from "react";
import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 5_000;
const ERROR_RETRY_MS = 30_000;

export function useNowPlaying(enabled: boolean) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaExceededRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      quotaExceededRef.current = false;
      setData(null);
      setError(false);
      return;
    }

    let active = true;
    quotaExceededRef.current = false;

    const clearTimer = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();
      if (
        !active ||
        quotaExceededRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void poll();
      }, delay);
    };

    async function poll() {
      if (
        !active ||
        quotaExceededRef.current ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      try {
        const res = await fetch("/api/now-playing", {
          cache: "no-store",
        });

        if (!res.ok) {
          if (active) setError(true);

          if (res.status === 429) {
            const body = (await res.json().catch(() => null)) as {
              reason?: string;
            } | null;

            if (body?.reason === "QUOTA_EXCEEDED") {
              quotaExceededRef.current = true;
              clearTimer();
              return;
            }

            const retryAfter = Number(res.headers.get("retry-after") ?? "");
            const retryMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? retryAfter * 1000
                : ERROR_RETRY_MS;
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

      if (
        document.visibilityState === "visible" &&
        !quotaExceededRef.current
      ) {
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
