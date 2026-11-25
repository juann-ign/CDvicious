"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { createCanonicalPlayerControls, EMPTY_CONTROL_STATE, type PlayerCapabilities } from "@/lib/canonicalPlayerControls";
import { createDirectTrackPlayback, createTrackSelectionBaseline } from "@/lib/directTrackPlayback";
import { getPlaybackState, subscribePlaybackState } from "@/lib/playbackSnapshotCoordinator";
import * as mockStore from "@/lib/mockSpotifyStore";
import * as liveStore from "@/lib/nowPlayingStore";

const mock = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1";
const nowPlaying = mock ? mockStore : liveStore;
let retryAt = 0;
const readLiveTrackBaseline = createTrackSelectionBaseline(() => liveStore.getSnapshot().data, getPlaybackState);
const playTrack = createDirectTrackPlayback({
  readBaseline: mock ? undefined : readLiveTrackBaseline,
  read: () => {
    if (!mock) return liveStore.getSnapshot();
    const { data } = mockStore.getSnapshot();
    return { data, requestStartedAt: data?.sampledAt };
  },
  subscribe: nowPlaying.subscribe,
  refresh: () => window.dispatchEvent(new Event("cdvicious:player_state_changed")),
  async request(target, selection, signal) {
    if (mock) {
      if (!mockStore.playMockTrack(selection)) throw new Error("La pista no está disponible en este disco. Elegí otra.");
      return;
    }
    let response: Response;
    try {
      response = await fetch("/api/play", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ uri: `spotify:album:${selection.albumId}`, deviceId: target.deviceId, trackPosition: selection.position }),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.");
    }
    const body = await response.json().catch(() => null) as { success?: boolean; message?: unknown } | null;
    if (!response.ok || body?.success !== true) {
      throw new Error(typeof body?.message === "string" ? body.message : "Spotify no aceptó la pista seleccionada. Reintentá.");
    }
  },
});
const controller = createCanonicalPlayerControls(async (target, signal) => {
  if (mock) return { volumeSupported: true, transportSupported: true, volume: await target.player.getVolume() };
  if (Date.now() < retryAt) throw new Error("Device rate limit active");
  const response = await fetch(`/api/player-capabilities?deviceId=${encodeURIComponent(target.deviceId)}`, {
    cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
  });
  if (response.status === 429) {
    const after = response.headers.get("Retry-After")?.trim();
    retryAt = after && /^\d+$/.test(after) ? Date.now() + Number(after) * 1000 : Math.max(Date.now() + 1000, Date.parse(after ?? "") || 0);
  }
  if (!response.ok) throw new Error("Device capabilities unavailable");
  const data = await response.json() as PlayerCapabilities & { deviceId?: string };
  if (data.deviceId !== target.deviceId) throw new Error("Stale device capabilities");
  // getVolume measures the SDK's actual local device; do not use it to invent a
  // value for an external Spotify Connect device.
  if (target.deviceId === target.sdkDeviceId && data.volumeSupported) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try { data.volume = await Promise.race([target.player.getVolume(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("SDK volume timeout")), 3000); })]); }
    finally { clearTimeout(timeout); }
  }
  return data;
}, playTrack);
let leases = 0;
let disconnectPlayback: (() => void) | null = null;
let disconnectEvents: (() => void) | null = null;
const getServerSnapshot = () => EMPTY_CONTROL_STATE;
const EMPTY_NOW_PLAYING = { data: null, error: false } as const;
const getEmptyNowPlaying = () => EMPTY_NOW_PLAYING;

/** Both physical front and footer consume exactly this device/volume state. */
export function useCanonicalPlayerControls() {
  const { player, isReady, deviceId } = useSpotifyPlayer();
  const observed = useSyncExternalStore(nowPlaying.subscribe, nowPlaying.getSnapshot, getEmptyNowPlaying);
  const observedDeviceId = observed.data?.deviceId;
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, getServerSnapshot);
  useEffect(() => {
    leases++;
    if (!disconnectPlayback) {
      const sync = () => {
        if (!mock) readLiveTrackBaseline();
        controller.setBlocked(getPlaybackState().busy);
      };
      const stopHandoff = subscribePlaybackState(sync);
      const stopObservation = mock ? null : liveStore.subscribe(readLiveTrackBaseline);
      disconnectPlayback = () => { stopHandoff(); stopObservation?.(); };
      sync();
      let refreshTimer: number | null = null;
      const refresh = () => {
        const current = controller.getSnapshot();
        if (document.visibilityState === "visible" && !getPlaybackState().busy && !current.volumeLoading && !current.volumePending) void controller.refreshVolume();
      };
      const scheduleRefresh = () => {
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        refreshTimer = window.setTimeout(() => { refreshTimer = null; refresh(); }, 200);
      };
      document.addEventListener("visibilitychange", refresh);
      window.addEventListener("cdvicious:player_state_changed", scheduleRefresh);
      disconnectEvents = () => {
        if (refreshTimer !== null) window.clearTimeout(refreshTimer);
        document.removeEventListener("visibilitychange", refresh); window.removeEventListener("cdvicious:player_state_changed", scheduleRefresh);
      };
    }
    return () => {
      if (--leases === 0) { disconnectPlayback?.(); disconnectPlayback = null; disconnectEvents?.(); disconnectEvents = null; controller.configure(null); }
    };
  }, []);
  useEffect(() => {
    controller.configure(player && isReady && deviceId ? { player, sdkDeviceId: deviceId, deviceId: observedDeviceId ?? deviceId } : null);
  }, [player, isReady, deviceId, observedDeviceId]);
  return { ...state, setVolume: controller.setVolume, toggleMute: controller.toggleMute,
    previous: controller.previous, next: controller.next, toggle: controller.toggle,
    refreshVolume: controller.refreshVolume, selectTrack: controller.selectTrack };
}
