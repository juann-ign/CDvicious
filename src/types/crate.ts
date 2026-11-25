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
  name: string;
  duration_ms: number;
}
