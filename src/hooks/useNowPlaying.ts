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
  const pollInFlightRef = useRef(false);
  const lastPollStartedAtRef = useRef(0);

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

      const elapsed = Date.now() - lastPollStartedAtRef.current;
      const minDelay =
        lastPollStartedAtRef.current === 0
          ? 0
          : Math.max(0, POLL_INTERVAL_MS - elapsed);
      const nextDelay = Math.max(delay, minDelay);

      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void poll();
      }, nextDelay);
    };

    async function poll() {
      if (
        !active ||
        quotaExceededRef.current ||
        document.visibilityState !== "visible" ||
        pollInFlightRef.current
      ) {
        return;
      }

      const elapsed = Date.now() - lastPollStartedAtRef.current;
      if (
        lastPollStartedAtRef.current !== 0 &&
        elapsed < POLL_INTERVAL_MS
      ) {
        schedule(POLL_INTERVAL_MS - elapsed);
        return;
      }

      pollInFlightRef.current = true;
      lastPollStartedAtRef.current = Date.now();

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
            schedule(Math.max(retryMs, POLL_INTERVAL_MS));
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
      } finally {
        pollInFlightRef.current = false;
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
