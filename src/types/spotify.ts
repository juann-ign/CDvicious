export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
}

export interface NowPlayingResponse {
  isPlaying: boolean;
  progressMs: number | null;
  durationMs: number | null;
  track: SpotifyTrack | null;
}

export interface UserProfile {
  displayName: string;
  avatarUrl: string | null;
}
