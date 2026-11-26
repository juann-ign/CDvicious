import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse } from "@/types/spotify";
import type { MechanicalDockClickOutcome } from "./mechanicalDockClick";

export interface PlaybackAttempt {
  attemptId: string;
  albumId: string;
  albumName: string;
  artworkUrl?: string;
  deviceId: string;
  startedAt: number;
}
export interface ConfirmedPlayback {
  attemptId: string;
  snapshot: NowPlayingResponse;
}
export type PlaybackPhase = "idle" | "loading" | "docked" | "confirmed" | "degraded" | "failed" | "cancelled";
export interface PlaybackState {
  phase: PlaybackPhase;
  attempt: Readonly<PlaybackAttempt> | null;
  snapshot: NowPlayingResponse | null;
  message: string | null;
  busy: boolean;
  dockClick: MechanicalDockClickOutcome | null;
}
const EMPTY_PLAYBACK_STATE: PlaybackState = Object.freeze({ phase: "idle", attempt: null, snapshot: null, message: null, busy: false, dockClick: null });
let sequence = 0;
let active: { attempt: Readonly<PlaybackAttempt>; docked: boolean; cancel: (() => void) | null } | null = null;
let confirmed: ConfirmedPlayback | null = null;
let playbackState = EMPTY_PLAYBACK_STATE;
const listeners = new Set<() => void>();
const stateListeners = new Set<() => void>();
const publish = (changes: Partial<PlaybackState>) => {
  playbackState = Object.freeze({ ...playbackState, ...changes });
  stateListeners.forEach((listener) => listener());
};
export function subscribePlaybackState(listener: () => void) { stateListeners.add(listener); return () => { stateListeners.delete(listener); }; }
export function getPlaybackState() { return playbackState; }
export function getEmptyPlaybackState() { return EMPTY_PLAYBACK_STATE; }
export function subscribePlaybackConfirmation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function beginPlaybackAttempt(album: AlbumItem, deviceId: string): PlaybackAttempt | null {
  if (active) return null;
  const attempt = Object.freeze({ attemptId: `play-${Date.now()}-${++sequence}`, albumId: album.id, albumName: album.name, artworkUrl: album.images[0]?.url, deviceId, startedAt: Date.now() });
  active = { attempt, docked: false, cancel: null };
  publish({ phase: "loading", attempt, snapshot: null, message: null, busy: true, dockClick: null });
  return attempt;
}
export function isActivePlaybackAttempt(attemptId: string) { return active?.attempt.attemptId === attemptId; }
export function playbackEventAttemptId(event: Event): string | null {
  const detail = (event as CustomEvent<{ attemptId?: unknown }>).detail;
  return typeof detail?.attemptId === "string" && detail.attemptId.length ? detail.attemptId : null;
}
// UI cleanup may arrive just after confirmation. It still belongs to the last
// attempt, but can never mutate a newer attempt. Admission uses the active guard.
export function isCurrentPlaybackEvent(event: Event) { const id = playbackEventAttemptId(event); return id !== null && playbackState.attempt?.attemptId === id; }
export function registerPlaybackCancellation(attemptId: string, cancel: () => void) {
  if (!active || active.attempt.attemptId !== attemptId) return () => undefined;
  const owner = active;
  owner.cancel = cancel;
  if (playbackState.phase === "cancelled") cancel();
  return () => { if (active === owner && owner.cancel === cancel) owner.cancel = null; };
}
export function markPlaybackDocked(attemptId: string) {
  if (!active || active.attempt.attemptId !== attemptId || !["loading", "docked"].includes(playbackState.phase)) return false;
  if (!active.docked) { active.docked = true; publish({ phase: "docked" }); }
  return true;
}
export function cancelPlaybackAttempt(attemptId: string, message = "Carga cancelada.") {
  if (!active || active.attempt.attemptId !== attemptId || !["loading", "docked"].includes(playbackState.phase)) return false;
  const cancel = active.cancel;
  publish({ phase: "cancelled", message, snapshot: null });
  cancel?.();
  return true;
}
export function failPlaybackAttempt(attemptId: string, message: string, phase: "failed" | "degraded" = "failed") {
  if (!isActivePlaybackAttempt(attemptId) || !["loading", "docked"].includes(playbackState.phase)) return false;
  publish({ phase, message, snapshot: null });
  return true;
}
export function setPlaybackDockClick(attemptId: string, dockClick: MechanicalDockClickOutcome) {
  if (isActivePlaybackAttempt(attemptId) && ["loading", "docked"].includes(playbackState.phase) && playbackState.dockClick !== dockClick) publish({ dockClick });
}
export function matchesPlaybackSnapshot(attempt: PlaybackAttempt, snapshot: NowPlayingResponse, requestedAt: number) {
  if (!isActivePlaybackAttempt(attempt.attemptId) || !active?.docked ||
    !["docked", "confirmed"].includes(playbackState.phase) || !Number.isFinite(requestedAt) || requestedAt < attempt.startedAt ||
    typeof snapshot.sampledAt !== "number" || !Number.isFinite(snapshot.sampledAt) || snapshot.sampledAt < requestedAt || Date.now() - snapshot.sampledAt > 5000 ||
    snapshot.sampledAt > Date.now() + 1000 || snapshot.isPlaying !== true ||
    snapshot.track?.album?.id !== attempt.albumId || snapshot.deviceId !== attempt.deviceId) return false;
  return true;
}
export function confirmPlaybackSnapshot(attempt: PlaybackAttempt, snapshot: NowPlayingResponse, requestedAt: number) {
  if (!matchesPlaybackSnapshot(attempt, snapshot, requestedAt)) return false;
  if (confirmed?.attemptId === attempt.attemptId) return true;
  confirmed = { attemptId: attempt.attemptId, snapshot };
  publish({ phase: "confirmed", snapshot, message: null });
  listeners.forEach((listener) => listener());
  return true;
}
export function getConfirmedPlayback() { return confirmed; }
export function finishPlaybackAttempt(attemptId: string) {
  if (!isActivePlaybackAttempt(attemptId)) return;
  active = null;
  publish({ busy: false, ...(["loading", "docked"].includes(playbackState.phase) ? { phase: "cancelled" as const, message: "Carga cancelada." } : {}) });
}
