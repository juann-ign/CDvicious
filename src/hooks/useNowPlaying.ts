"use client";

import { useEffect, useState } from "react";
import type { NowPlayingResponse } from "@/types/spotify";

const POLL_INTERVAL_MS = 5_000;
const ERROR_RETRY_MS = 30_000;

export function useNowPlaying(enabled: boolean) {
  const [data, setData] = useState<NowPlayingResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setError(false);
      return;
    }

    let active = true;
    let pollInFlight = false;
    let lastPollStartedAt = 0;
    let quotaExceeded = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const schedule = (delay: number) => {
      clearTimer();

      if (
        !active ||
        quotaExceeded ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      const elapsed = Date.now() - lastPollStartedAt;
      const minDelay =
        lastPollStartedAt === 0
          ? 0
          : Math.max(0, POLL_INTERVAL_MS - elapsed);
      const nextDelay = Math.max(delay, minDelay);

      timer = setTimeout(() => {
        timer = null;
        void poll();
      }, nextDelay);
    };

    async function poll() {
      if (
        !active ||
        quotaExceeded ||
        document.visibilityState !== "visible" ||
        pollInFlight
      ) {
        return;
      }

      const elapsed = Date.now() - lastPollStartedAt;
      if (lastPollStartedAt !== 0 && elapsed < POLL_INTERVAL_MS) {
        schedule(POLL_INTERVAL_MS - elapsed);
        return;
      }

      pollInFlight = true;
      lastPollStartedAt = Date.now();

      try {
        const res = await fetch("/api/now-playing", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!res.ok) {
          if (active) setError(true);

          if (res.status === 429) {
            const body = (await res.json().catch(() => null)) as {
              reason?: string;
            } | null;

            if (body?.reason === "QUOTA_EXCEEDED") {
              quotaExceeded = true;
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
      } catch (requestError) {
        if (!active) return;

        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }

        setError(true);
        schedule(ERROR_RETRY_MS);
      } finally {
        pollInFlight = false;
      }
    }

    const handleVisibility = () => {
      clearTimer();

      if (
        document.visibilityState === "visible" &&
        !quotaExceeded
      ) {
        void poll();
      }
    };

    void poll();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      controller.abort();
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  return { data, error };
}
