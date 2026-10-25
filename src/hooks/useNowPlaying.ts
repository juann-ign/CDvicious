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

  // A flight can update the mock store while Deck is off-chapter. Keep the
  // cheap store subscription alive in mock mode so Deck can retain the latest
  // confirmed snapshot without acquiring its progress timer until it is active.
  const shouldSubscribe = enabled || mockMode;
  const snapshot = useSyncExternalStore(
    shouldSubscribe ? store.subscribe : noopSubscribe,
    shouldSubscribe ? store.getSnapshot : getEmptySnapshot,
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

  if (!enabled && !mockMode) {
    return EMPTY_SNAPSHOT;
  }

  return snapshot;
}
