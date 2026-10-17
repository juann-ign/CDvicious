"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as nowPlayingStore from "@/lib/nowPlayingStore";
import * as mockSpotifyStore from "@/lib/mockSpotifyStore";

const EMPTY_SNAPSHOT = {
  data: null,
  error: false,
} as const;

const noopSubscribe = () => () => undefined;
const getEmptySnapshot = () => EMPTY_SNAPSHOT;

export function useNowPlaying(enabled: boolean) {
  const mockMode = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1";
  const store = mockMode ? mockSpotifyStore : nowPlayingStore;

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
