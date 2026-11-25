"use client";

import { getMockPlaybackAlbums, getMockTracks } from "@/mocks/demoCatalog";
import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse } from "@/types/spotify";

export interface MockSpotifyPlayer {
  togglePlay(): Promise<void>;
  previousTrack(): Promise<void>;
  nextTrack(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getVolume(): Promise<number>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(positionMs: number): Promise<void>;
}

type Snapshot = {
  data: NowPlayingResponse | null;
  error: boolean;
};

const MOCK_ALBUMS = getMockPlaybackAlbums();
const listeners = new Set<() => void>();

let albumIndex = 0;
let trackIndex = 0;
let volume = 0.5;
let subscriberCount = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;

function createSnapshot(
  album: AlbumItem,
  nextTrackIndex: number,
  isPlaying: boolean,
  progressMs: number,
): Snapshot {
  const track = getMockTracks(album)[nextTrackIndex];

  return {
    error: false,
    data: {
      sampledAt: Date.now(),
      deviceId: "cdvicious-mock-device",
      isPlaying,
      progressMs,
      durationMs: track.duration_ms,
      track,
    },
  };
}

const firstAlbum = MOCK_ALBUMS[0];
let snapshot: Snapshot = createSnapshot(firstAlbum, 0, true, 42_000);

function notify() {
  listeners.forEach((listener) => listener());
}

function publish(next: Snapshot) {
  snapshot = { ...next, data: next.data ? { ...next.data, sampledAt: Date.now() } : null };
  notify();
}

function currentAlbum() {
  return MOCK_ALBUMS[albumIndex] ?? firstAlbum;
}

function setPlaybackState(isPlaying: boolean) {
  const data = snapshot.data;
  if (!data) return;

  publish({
    ...snapshot,
    data: { ...data, isPlaying },
  });
}

function selectTrack(nextAlbumIndex: number, nextTrackIndex: number, isPlaying: boolean) {
  albumIndex =
    (nextAlbumIndex % MOCK_ALBUMS.length + MOCK_ALBUMS.length) %
    MOCK_ALBUMS.length;
  const album = currentAlbum();
  const totalTracks = getMockTracks(album).length;
  trackIndex = (nextTrackIndex % totalTracks + totalTracks) % totalTracks;
  publish(createSnapshot(album, trackIndex, isPlaying, 0));
}

function moveTrack(direction: -1 | 1) {
  let nextAlbumIndex = albumIndex;
  let nextTrackIndex = trackIndex + direction;
  if (nextTrackIndex < 0) {
    nextAlbumIndex = (albumIndex - 1 + MOCK_ALBUMS.length) % MOCK_ALBUMS.length;
    nextTrackIndex = getMockTracks(MOCK_ALBUMS[nextAlbumIndex]).length - 1;
  } else if (nextTrackIndex >= getMockTracks(currentAlbum()).length) {
    nextAlbumIndex = (albumIndex + 1) % MOCK_ALBUMS.length;
    nextTrackIndex = 0;
  }
  const isPlaying = snapshot.data?.isPlaying ?? true;

  selectTrack(nextAlbumIndex, nextTrackIndex, isPlaying);
}

function tickProgress() {
  const data = snapshot.data;

  if (!data?.isPlaying || data.durationMs === null || data.progressMs === null) {
    return;
  }

  const nextProgress = data.progressMs + 1_000;
  if (nextProgress >= data.durationMs) {
    moveTrack(1);
    return;
  }

  publish({
    ...snapshot,
    data: { ...data, progressMs: nextProgress },
  });
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot() {
  return snapshot;
}

export function restoreMockSnapshot(previous: Snapshot) {
  publish(previous);
}

export function acquire() {
  subscriberCount += 1;

  if (subscriberCount === 1) {
    progressTimer = setInterval(tickProgress, 1_000);
  }
}

export function release() {
  subscriberCount = Math.max(0, subscriberCount - 1);

  if (subscriberCount === 0 && progressTimer !== null) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

/** Selects a mock album while the CD is in flight; resume() starts it at zero. */
export function loadMockAlbum(album: AlbumItem) {
  const matchedIndex = MOCK_ALBUMS.findIndex((item) => item.id === album.id);
  // Artist releases and saved albums share the same queue. A caller-supplied
  // demo edition must also remain selected when transport advances.
  albumIndex = matchedIndex >= 0 ? matchedIndex : MOCK_ALBUMS.push(album) - 1;
  trackIndex = 0;

  publish(createSnapshot(album, trackIndex, false, 0));
}

export const mockSpotifyPlayer: MockSpotifyPlayer = {
  async togglePlay() {
    setPlaybackState(!(snapshot.data?.isPlaying ?? false));
  },

  async previousTrack() {
    moveTrack(-1);
  },

  async nextTrack() {
    moveTrack(1);
  },

  async setVolume(nextVolume: number) {
    volume = Math.max(0, Math.min(1, Number.isFinite(nextVolume) ? nextVolume : 0.5));
  },

  async getVolume() {
    return volume;
  },

  async pause() {
    setPlaybackState(false);
  },

  async resume() {
    setPlaybackState(true);
  },

  async seek(positionMs: number) {
    const data = snapshot.data;
    if (!data || data.durationMs === null) return;

    const progressMs = Math.max(
      0,
      Math.min(data.durationMs, Number.isFinite(positionMs) ? positionMs : 0),
    );

    publish({
      ...snapshot,
      data: { ...data, progressMs },
    });
  },
};
