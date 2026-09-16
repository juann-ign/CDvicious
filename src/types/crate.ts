export interface AlbumItem {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string; width?: number; height?: number }[];
  uri: string;
  release_date?: string;
  genres?: string[];
}

export interface AlbumTrack {
  name: string;
  duration_ms: number;
}
