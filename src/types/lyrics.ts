export type LyricsStatus = "available" | "instrumental" | "unavailable" | "error";
export interface LyricsResponse {
  status: LyricsStatus;
  lyrics: string | null;
  provenance: { provider: "lrclib" | "demo"; match?: "exact" | "validated-search"; recordId?: number };
  error?: string;
}
