"use client";

import mockCollection from "@/mocks/collection.json";
import type { AlbumItem } from "@/types/crate";
import type { NowPlayingResponse, SpotifyTrack } from "@/types/spotify";

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

const TRACKS_PER_ALBUM = 10;
const MOCK_ALBUMS = mockCollection as AlbumItem[];
const listeners = new Set<() => void>();

let albumIndex = 0;
let trackIndex = 0;
let volume = 0.5;
let subscriberCount = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;

function createTrack(album: AlbumItem, index: number): SpotifyTrack {
  return {
    id: `mock-track-${album.id}-${index + 1}`,
    name: `DEMO TRACK ${String(index + 1).padStart(2, "0")}`,
    artists: album.artists.map((artist) => ({ name: artist.name })),
    duration_ms: 150_000 + index * 9_000,
    album: {
      name: album.name,
      images: album.images.map((image) => ({
        url: image.url,
        width: image.width ?? 600,
        height: image.height ?? 600,
      })),
    },
  };
}

function createSnapshot(
  album: AlbumItem,
  nextTrackIndex: number,
  isPlaying: boolean,
  progressMs: number,
): Snapshot {
  const track = createTrack(album, nextTrackIndex);

  return {
    error: false,
    data: {
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
  snapshot = next;
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
  trackIndex =
    (nextTrackIndex % TRACKS_PER_ALBUM + TRACKS_PER_ALBUM) %
    TRACKS_PER_ALBUM;

  const album = currentAlbum();
  publish(createSnapshot(album, trackIndex, isPlaying, 0));
}

function moveTrack(direction: -1 | 1) {
  let absoluteIndex = albumIndex * TRACKS_PER_ALBUM + trackIndex + direction;
  const totalTracks = MOCK_ALBUMS.length * TRACKS_PER_ALBUM;
  absoluteIndex = (absoluteIndex % totalTracks + totalTracks) % totalTracks;

  const nextAlbumIndex = Math.floor(absoluteIndex / TRACKS_PER_ALBUM);
  const nextTrackIndex = absoluteIndex % TRACKS_PER_ALBUM;
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
  if (matchedIndex >= 0) albumIndex = matchedIndex;
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
