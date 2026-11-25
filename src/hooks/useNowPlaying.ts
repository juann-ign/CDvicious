"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as nowPlayingStore from "@/lib/nowPlayingStore";
import { mockPlayback } from "@/lib/mockPlayback";

const EMPTY_SNAPSHOT = {
  data: null,
  error: false,
} as const;

const noopSubscribe = () => () => undefined;
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export function useNowPlaying(enabled: boolean) {
  const store = mockPlayback ?? nowPlayingStore;

  const snapshot = useSyncExternalStore(
    enabled ? store.subscribe : noopSubscribe,
    enabled ? store.getSnapshot : getEmptySnapshot,
    getEmptySnapshot,
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    store.acquire();

    return () => {
      store.release();
    };
  }, [enabled, store]);

  if (!enabled) {
    return EMPTY_SNAPSHOT;
  }

  return snapshot;
}
