export type ArtistGenreState = "complete" | "empty" | "unavailable" | "error";

export interface ArtistGenreResponse {
  artistId: string;
  genres: string[];
  source: "spotify-artist" | "demo";
  state: ArtistGenreState;
  error?: { status: number; reason?: string };
}
