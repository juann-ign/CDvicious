import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse } from "@/types/spotify";

export interface PlaybackAttempt {
  attemptId: string;
  albumId: string;
  deviceId: string;
  startedAt: number;
}
export interface ConfirmedPlayback {
  attemptId: string;
  snapshot: NowPlayingResponse;
}
let sequence = 0;
let active: PlaybackAttempt | null = null;
let confirmed: ConfirmedPlayback | null = null;
const listeners = new Set<() => void>();
export function subscribePlaybackConfirmation(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function beginPlaybackAttempt(album: AlbumItem, deviceId: string): PlaybackAttempt | null {
  if (active) return null;
  active = { attemptId: `play-${Date.now()}-${++sequence}`, albumId: album.id, deviceId, startedAt: Date.now() };
  return active;
}
export function isActivePlaybackAttempt(attemptId: string) { return active?.attemptId === attemptId; }
export function confirmPlaybackSnapshot(attempt: PlaybackAttempt, snapshot: NowPlayingResponse, requestedAt: number) {
  if (!isActivePlaybackAttempt(attempt.attemptId) || requestedAt < attempt.startedAt ||
    !snapshot.sampledAt || snapshot.sampledAt < requestedAt || Date.now() - snapshot.sampledAt > 5000 ||
    snapshot.sampledAt > Date.now() + 1000 || !snapshot.isPlaying ||
    snapshot.track?.album.id !== attempt.albumId || snapshot.deviceId !== attempt.deviceId) return false;
  confirmed = { attemptId: attempt.attemptId, snapshot };
  listeners.forEach((listener) => listener());
  return true;
}
export function getConfirmedPlayback() { return confirmed; }
export function finishPlaybackAttempt(attemptId: string) {
  if (isActivePlaybackAttempt(attemptId)) active = null;
}
