export interface AlbumItem {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; width?: number; height?: number }[];
  uri: string;
  release_date?: string;
  label?: string;
  genres?: string[];
  genreMetadata?: {
    source: "spotify-artist" | "demo";
    state: "complete" | "partial" | "unavailable";
    resolvedArtists: number;
    totalArtists: number;
  };
}

export interface AlbumTrack {
  id: string | null;
  uri: string | null;
  name: string;
  duration_ms: number;
  track_number: number;
  disc_number: number;
  /** Zero-based position in the provider's album context. */
  position: number;
  playable: boolean;
  linkedFromId?: string;
}
