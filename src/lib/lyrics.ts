import type { LyricsResponse } from "@/types/lyrics";

export interface LyricsSignature { artist: string; title: string; album: string; duration?: number; }
interface LyricsRecord { id?: number; trackName?: string; artistName?: string; albumName?: string; duration?: number; instrumental?: boolean; plainLyrics?: string | null; syncedLyrics?: string | null; }
export function normalizeLyricsText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.replace(/\r\n?/g, "\n").trim() || null;
}
const normalizedName = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
export function matchesLyricsSignature(value: unknown, signature: LyricsSignature): value is LyricsRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as LyricsRecord;
  return typeof record.trackName === "string" && normalizedName(record.trackName) === normalizedName(signature.title)
    && typeof record.artistName === "string" && normalizedName(record.artistName) === normalizedName(signature.artist)
    && (!signature.album || (typeof record.albumName === "string" && normalizedName(record.albumName) === normalizedName(signature.album)))
    && (signature.duration === undefined || (typeof record.duration === "number" && Number.isFinite(record.duration) && Math.abs(record.duration - signature.duration) <= 2));
}
export function lyricsFromRecord(record: LyricsRecord, match: "exact" | "validated-search"): LyricsResponse {
  const provenance: LyricsResponse["provenance"] = { provider: "lrclib", match, ...(typeof record.id === "number" ? { recordId: record.id } : {}) };
  if (record.instrumental === true) return { status: "instrumental", lyrics: null, provenance };
  const synced = normalizeLyricsText(record.syncedLyrics)?.replace(/^\[(?:ar|al|ti|by|offset|length):[^\]]*\]\s*$/gm, "").replace(/\[\d+:\d+(?:[.:]\d+)?\]/g, "");
  const lyrics = normalizeLyricsText(record.plainLyrics) ?? normalizeLyricsText(synced);
  return { status: lyrics ? "available" : "unavailable", lyrics, provenance };
}
export function selectLyricsRecord(values: unknown[], signature: LyricsSignature): LyricsResponse | null {
  const valid = values.filter((value) => matchesLyricsSignature(value, signature)).map((record) => lyricsFromRecord(record, "validated-search"));
  return valid.find((result) => result.status === "available") ?? valid.find((result) => result.status === "instrumental") ?? valid[0] ?? null;
}
// Older clients and intercepted fixtures may provide only { lyrics }. Blank
// strings remain unavailable; absence alone never declares an instrumental.
export function parseLyricsResponse(value: unknown): LyricsResponse {
  const body = value && typeof value === "object" ? value as Partial<LyricsResponse> : {};
  const provenance = body.provenance?.provider === "demo" || body.provenance?.provider === "lrclib" ? body.provenance : { provider: "lrclib" as const };
  if (body.status === "error") return { status: "error", lyrics: null, provenance, error: typeof body.error === "string" ? body.error : "No se pudo cargar la letra." };
  if (body.status === "instrumental") return { status: "instrumental", lyrics: null, provenance };
  if (body.status === "unavailable") return { status: "unavailable", lyrics: null, provenance };
  const lyrics = normalizeLyricsText(body.lyrics);
  return { status: lyrics ? "available" : "unavailable", lyrics, provenance };
}
