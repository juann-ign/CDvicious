"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as nowPlayingStore from "@/lib/nowPlayingStore";

const EMPTY_SNAPSHOT = {
  data: null,
  error: false,
} as const;

const noopSubscribe = () => () => undefined;
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export function useNowPlaying(enabled: boolean) {
  const snapshot = useSyncExternalStore(
    enabled ? nowPlayingStore.subscribe : noopSubscribe,
    enabled ? nowPlayingStore.getSnapshot : getEmptySnapshot,
    getEmptySnapshot,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    nowPlayingStore.acquire();

    return () => {
      nowPlayingStore.release();
    };
  }, [enabled]);

  if (!enabled) {
    return EMPTY_SNAPSHOT;
  }

  return snapshot;
}
