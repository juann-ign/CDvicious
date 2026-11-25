"use client";

import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse } from "@/types/spotify";
import type { MockSpotifyPlayer } from "./mockSpotifyStore";
import * as mockStore from "./mockSpotifyStore";
import { beginPlaybackAttempt, confirmPlaybackSnapshot, finishPlaybackAttempt, isActivePlaybackAttempt } from "./playbackSnapshotCoordinator";

export type PlayExecutionResult = { success: boolean; message?: string };
export type StartPlayExecution = () => Promise<PlayExecutionResult>;

function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Spotify no confirmó la reproducción a tiempo."));
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

function waitForDock(signal: AbortSignal) {
  if (document.documentElement.dataset.discFlightPlaybackReady === "true") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const clear = () => { window.removeEventListener("cdvicious:disc-flight-playback-ready", ready); signal.removeEventListener("abort", aborted); };
    const ready = () => { clear(); resolve(); };
    const aborted = () => { clear(); reject(new Error("Spotify no confirmó la reproducción a tiempo.")); };
    window.addEventListener("cdvicious:disc-flight-playback-ready", ready);
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

export function createDiscPlaybackExecution(album: AlbumItem, deviceId: string, player: Spotify.Player | MockSpotifyPlayer): StartPlayExecution | null {
  const attempt = beginPlaybackAttempt(album, deviceId);
  if (!attempt) return null;
  window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-started", { detail: attempt }));
  let task: Promise<PlayExecutionResult> | null = null;
  return () => task ??= (async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25_000);
    let previousVolume = 0.5;
    let muted = false;
    let requestedPlayback = false;
    const priorMockSnapshot = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1" ? mockStore.getSnapshot() : null;
    const restoreVolume = async () => {
      if (!muted) return;
      muted = false;
      await untilAborted(player.setVolume(previousVolume).catch(() => player.setVolume(0.5).catch(() => undefined)), AbortSignal.timeout(2000)).catch(() => undefined);
    };
    try {
      previousVolume = await untilAborted(player.getVolume().catch(() => 0.5), controller.signal);
      muted = true;
      await untilAborted(player.setVolume(0), controller.signal);
      const response = await fetch("/api/play", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: album.uri, deviceId, attemptId: attempt.attemptId }), signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.success !== true) throw new Error(body?.message ?? (response.status === 401
        ? "Tu sesión de Spotify expiró. Volvé a iniciar sesión." : response.status === 429
        ? "Spotify está limitando las solicitudes. Esperá antes de reintentar." : "Spotify no confirmó la reproducción."));
      requestedPlayback = true;
      if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") mockStore.loadMockAlbum(album);
      await untilAborted(player.pause().catch(() => undefined), controller.signal);
      await waitForDock(controller.signal);
      await untilAborted(player.seek(0).catch(() => undefined), controller.signal);
      await untilAborted(player.resume(), controller.signal);

      // Neither HTTP 200 nor arrival changes the VFD. Request a new observation
      // after resume, and match album identity, device, freshness and attempt.
      while (!controller.signal.aborted && isActivePlaybackAttempt(attempt.attemptId)) {
        const requestedAt = Date.now();
        let snapshot: NowPlayingResponse | null;
        if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
          const data = mockStore.getSnapshot().data;
          snapshot = data ? { ...data, sampledAt: Date.now(), deviceId } : null;
        } else {
          const observation = await fetch("/api/now-playing", { cache: "no-store", signal: controller.signal });
          if (observation.status === 401 || observation.status === 429) throw new Error(observation.status === 401 ? "Tu sesión de Spotify expiró. Volvé a iniciar sesión." : "Spotify está limitando las solicitudes. Esperá antes de reintentar.");
          snapshot = observation.ok ? await observation.json() : null;
        }
        if (snapshot && confirmPlaybackSnapshot(attempt, snapshot, requestedAt)) {
          await restoreVolume();
          window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-playback-started", { detail: { attemptId: attempt.attemptId, snapshot } }));
          window.dispatchEvent(new Event("cdvicious:player_state_changed"));
          return { success: true };
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 600));
      }
      throw new Error("Spotify no confirmó la reproducción a tiempo. Podés reintentar.");
    } catch (error) {
      if (requestedPlayback) await untilAborted(player.pause(), AbortSignal.timeout(2000)).catch(() => undefined);
      if (priorMockSnapshot && requestedPlayback) mockStore.restoreMockSnapshot(priorMockSnapshot);
      return { success: false, message: controller.signal.aborted ? "Spotify no confirmó la reproducción a tiempo. Podés reintentar." : error instanceof Error && error.message !== "Failed to fetch" ? error.message : "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo." };
    } finally {
      controller.abort(); window.clearTimeout(timeout);
      await restoreVolume(); finishPlaybackAttempt(attempt.attemptId);
    }
  })();
}
