export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  duration_ms: number;
  album: {
    id?: string;
    name: string;
    images: { url: string; width: number; height: number }[];
  };
}

export interface NowPlayingResponse {
  sampledAt?: number;
  deviceId?: string;
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  track: SpotifyTrack | null;
}

export interface UserProfile {
  displayName: string;
  avatarUrl: string | null;
}
