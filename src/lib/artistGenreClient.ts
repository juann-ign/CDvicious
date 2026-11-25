import { CatalogError } from "./catalogClient";
import { normalizeGenres } from "./collectionFilters";
import type { ArtistGenreResponse } from "@/types/genres";

export async function fetchArtistGenres(artistId: string, signal: AbortSignal, retry = false): Promise<ArtistGenreResponse> {
  const response = await fetch(`/api/artists/${encodeURIComponent(artistId)}/genres${retry ? "?retry=1" : ""}`, { signal, cache: "no-store" });
  if (!response.ok) {
    const retry = response.headers.get("Retry-After")?.trim();
    const retryAt = retry && /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry ?? "") || 0;
    throw new CatalogError(response.status, retryAt);
  }
  const result = await response.json() as ArtistGenreResponse;
  if (result.artistId !== artistId || !Array.isArray(result.genres) || !result.genres.every((genre) => typeof genre === "string")
    || !["spotify-artist", "demo"].includes(result.source) || !["complete", "empty", "unavailable"].includes(result.state)) throw new CatalogError(502);
  const genres = normalizeGenres(result.genres);
  if ((result.state === "complete") !== (genres.length > 0)) throw new CatalogError(502);
  return { ...result, genres };
}
