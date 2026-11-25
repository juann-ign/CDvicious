"use client";

import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse } from "@/types/spotify";
import type { MockSpotifyPlayer } from "./mockSpotifyStore";
import { mockPlayback } from "./mockPlayback";
import { beginPlaybackAttempt, cancelPlaybackAttempt, confirmPlaybackSnapshot, failPlaybackAttempt, finishPlaybackAttempt, getPlaybackState, isActivePlaybackAttempt, markPlaybackDocked, matchesPlaybackSnapshot, playbackEventAttemptId, registerPlaybackCancellation, setPlaybackDockClick, type PlaybackAttempt } from "./playbackSnapshotCoordinator";
import { armMechanicalDockClick } from "./mechanicalDockClick";

export type PlayExecutionResult = { success: boolean; message?: string; cancelled?: boolean };
export type StartPlayExecution = (() => Promise<PlayExecutionResult>) & {
  readonly attempt: Readonly<PlaybackAttempt>;
  cancel(): boolean;
  markDocked(): boolean;
};

const TIMEOUT_MESSAGE = "Spotify no confirmó la reproducción a tiempo. Podés reintentar.";
const CANCELLED_MESSAGE = "Carga cancelada.";

function untilAborted<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Playback attempt aborted"));
    signal.addEventListener("abort", abort, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

export function createDiscPlaybackExecution(album: AlbumItem, deviceId: string, player: Spotify.Player | MockSpotifyPlayer): StartPlayExecution | null {
  const admitted = beginPlaybackAttempt(album, deviceId);
  if (!admitted) return null;
  const attempt: PlaybackAttempt = admitted;
  const controller = new AbortController();
  // Audio activation belongs to this trusted gesture, before any SDK awaits.
  const click = armMechanicalDockClick();
  let task: Promise<PlayExecutionResult> | null = null;
  let timeout: number | null = null;
  let timedOut = false;
  let cancelEventSent = false;
  let unregisterCancellation: () => void = () => undefined;
  let resolveDock: () => void = () => undefined;
  const dock = new Promise<void>((resolve) => { resolveDock = resolve; });
  const clearDeadline = () => { if (timeout !== null) { window.clearTimeout(timeout); timeout = null; } };
  const cleanup = () => {
    clearDeadline();
    window.removeEventListener("cdvicious:disc-flight-playback-ready", ready);
    window.removeEventListener("cdvicious:disc-flight-cancelled", cancelled);
    unregisterCancellation(); click.dispose();
  };
  const assertActive = () => {
    if (controller.signal.aborted || !isActivePlaybackAttempt(attempt.attemptId)) throw new Error("Playback attempt aborted");
  };
  const execute = (() => task ??= run()) as StartPlayExecution;
  Object.defineProperties(execute, {
    attempt: { value: attempt, enumerable: true },
    markDocked: { value: () => {
      if (controller.signal.aborted || !markPlaybackDocked(attempt.attemptId)) return false;
      resolveDock(); return true;
    } },
    cancel: { value: () => {
      if (!cancelPlaybackAttempt(attempt.attemptId)) return false;
      if (!cancelEventSent) {
        cancelEventSent = true;
        window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-cancelled", { detail: { attemptId: attempt.attemptId } }));
      }
      return true;
    } },
  });
  function ready(event: Event) { if (playbackEventAttemptId(event) === attempt?.attemptId) execute.markDocked(); }
  function cancelled(event: Event) {
    if (playbackEventAttemptId(event) !== attempt?.attemptId) return;
    cancelEventSent = true; execute.cancel();
  }
  unregisterCancellation = registerPlaybackCancellation(attempt.attemptId, () => {
    controller.abort(); click.dispose();
    if (!task) { cleanup(); finishPlaybackAttempt(attempt.attemptId); }
  });
  if (!controller.signal.aborted) {
    window.addEventListener("cdvicious:disc-flight-playback-ready", ready);
    window.addEventListener("cdvicious:disc-flight-cancelled", cancelled);
    timeout = window.setTimeout(() => {
      timedOut = true; controller.abort(); click.dispose();
      if (!task) { failPlaybackAttempt(attempt.attemptId, TIMEOUT_MESSAGE); cleanup(); finishPlaybackAttempt(attempt.attemptId); }
    }, 25_000);
    window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-started", { detail: attempt }));
  }
  return execute;

  async function run(): Promise<PlayExecutionResult> {
    let previousVolume: number | null = null;
    let restoreNeeded = false;
    let restoreTask: Promise<boolean> | null = null;
    let muteConfirmed = false;
    let pauseConfirmed = false;
    let requestedPlayback = false;
    let result: PlayExecutionResult = { success: false, message: TIMEOUT_MESSAGE };
    const priorMockSnapshot = mockPlayback?.getSnapshot();
    const restoreVolume = () => restoreTask ??= (async () => {
      if (!restoreNeeded || previousVolume === null) return true;
      try {
        await untilAborted(player.setVolume(previousVolume), AbortSignal.timeout(2000));
        restoreNeeded = false;
        return true;
      } catch { return false; }
    })();
    const wait = () => new Promise<void>((resolve, reject) => {
      const clear = () => { window.clearTimeout(timer); controller.signal.removeEventListener("abort", aborted); };
      const aborted = () => { clear(); reject(new Error("Playback attempt aborted")); };
      const timer = window.setTimeout(() => { clear(); resolve(); }, 600);
      controller.signal.addEventListener("abort", aborted, { once: true });
      if (controller.signal.aborted) aborted();
    });
    const failureMessage = (error: unknown) => {
      if (getPlaybackState().attempt?.attemptId === attempt.attemptId && getPlaybackState().phase === "cancelled") return CANCELLED_MESSAGE;
      if (timedOut || controller.signal.aborted) return TIMEOUT_MESSAGE;
      return error instanceof Error && error.message !== "Failed to fetch" ? error.message : "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.";
    };
    try {
      assertActive();
      try { previousVolume = await untilAborted(player.getVolume(), controller.signal); }
      catch { throw new Error("No se pudo leer el volumen del dispositivo. Reintentá."); }
      if (!Number.isFinite(previousVolume) || previousVolume < 0 || previousVolume > 1) throw new Error("El dispositivo no informó un volumen válido.");
      assertActive(); restoreNeeded = true;
      await untilAborted(player.setVolume(0), controller.signal);
      muteConfirmed = true; assertActive();
      const response = await untilAborted(fetch("/api/play", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: album.uri, deviceId, attemptId: attempt.attemptId }), signal: controller.signal,
      }), controller.signal);
      const body = await untilAborted(response.json().catch(() => null), controller.signal);
      if (!response.ok || body?.success !== true) throw new Error(body?.message ?? (response.status === 401
        ? "Tu sesión de Spotify expiró. Volvé a iniciar sesión." : response.status === 429
        ? "Spotify está limitando las solicitudes. Esperá antes de reintentar." : "Spotify no confirmó la reproducción."));
      requestedPlayback = true;
      mockPlayback?.loadMockAlbum(album);
      assertActive();
      pauseConfirmed = await untilAborted(player.pause().then(() => true, () => false), controller.signal);
      await untilAborted(dock, controller.signal);
      assertActive();
      let safeToPlay = Boolean(mockPlayback) || (muteConfirmed && pauseConfirmed && requestedPlayback);
      if (!mockPlayback && safeToPlay) safeToPlay = await untilAborted(player.getVolume().then((value) => value === 0, () => false), controller.signal);
      assertActive();
      const clicking = click.play({ safeToPlay, signal: controller.signal, volume: previousVolume }).then((outcome) => {
        setPlaybackDockClick(attempt.attemptId, outcome); return outcome;
      });
      await untilAborted(clicking, controller.signal);
      assertActive();
      await untilAborted(player.seek(0).catch(() => undefined), controller.signal);
      assertActive();
      await untilAborted(player.resume(), controller.signal);

      // Neither HTTP 200 nor arrival changes the VFD. Request a new observation
      // after resume, and match album identity, device, freshness and attempt.
      while (!controller.signal.aborted && isActivePlaybackAttempt(attempt.attemptId)) {
        const requestedAt = Date.now();
        let snapshot: NowPlayingResponse | null;
        if (mockPlayback) {
          const data = mockPlayback.getSnapshot().data;
          snapshot = data ? { ...data, sampledAt: Date.now(), deviceId } : null;
        } else {
          const observation = await untilAborted(fetch("/api/now-playing", { cache: "no-store", signal: controller.signal }), controller.signal);
          if (observation.status === 401 || observation.status === 429) throw new Error(observation.status === 401 ? "Tu sesión de Spotify expiró. Volvé a iniciar sesión." : "Spotify está limitando las solicitudes. Esperá antes de reintentar.");
          snapshot = observation.ok ? await untilAborted(observation.json(), controller.signal) : null;
        }
        if (snapshot && matchesPlaybackSnapshot(attempt, snapshot, requestedAt)) {
          if (!await restoreVolume()) throw new Error("No se pudo restaurar el volumen original del dispositivo. Reintentá.");
          assertActive();
          if (!confirmPlaybackSnapshot(attempt, snapshot, requestedAt)) continue;
          clearDeadline();
          window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-playback-started", { detail: { attemptId: attempt.attemptId, snapshot } }));
          window.dispatchEvent(new Event("cdvicious:player_state_changed"));
          result = { success: true }; return result;
        }
        await wait();
      }
      throw new Error("Spotify no confirmó la reproducción a tiempo. Podés reintentar.");
    } catch (error) {
      if (requestedPlayback) await untilAborted(player.pause(), AbortSignal.timeout(2000)).catch(() => undefined);
      if (priorMockSnapshot && requestedPlayback) mockPlayback?.restoreMockSnapshot(priorMockSnapshot);
      const cancelled = getPlaybackState().attempt?.attemptId === attempt.attemptId && getPlaybackState().phase === "cancelled";
      result = { success: false, message: failureMessage(error), ...(cancelled ? { cancelled: true } : {}) };
      return result;
    } finally {
      controller.abort(); clearDeadline();
      const restored = await restoreVolume();
      if (!result.success && !result.cancelled) {
        if (!restored) result.message = "No se pudo restaurar el volumen original del dispositivo. Reintentá.";
        failPlaybackAttempt(attempt.attemptId, result.message ?? TIMEOUT_MESSAGE);
      }
      cleanup(); finishPlaybackAttempt(attempt.attemptId);
    }
  }
}
