import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchArtistGenresDetailed } from "@/lib/spotify";
import { mockArtistGenres } from "@/mocks/artistCatalog";
import { normalizeGenres } from "@/lib/collectionFilters";
import type { ArtistGenreResponse } from "@/types/genres";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) return NextResponse.json({ error: "INVALID_ARTIST_REQUEST" }, { status: 400 });
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const configured = mockArtistGenres(id);
    if (configured === undefined) return NextResponse.json({ error: "ARTIST_NOT_FOUND" }, { status: 404, headers });
    const genres = normalizeGenres(configured);
    return NextResponse.json({ artistId: id, genres, source: "demo", state: genres.length ? "complete" : "empty" } satisfies ArtistGenreResponse, { headers });
  }
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401, headers });
  try {
    // One selected artist, not one lookup for each album or catalog page.
    // This also shares the successful collection enrichment cache.
    const result = await fetchArtistGenresDetailed(token, [id], { individual: true, refreshUnavailable: new URL(request.url).searchParams.get("retry") === "1", signal: request.signal });
    if (Object.hasOwn(result.byArtist, id)) {
      const genres = result.byArtist[id];
      return NextResponse.json({ artistId: id, genres, source: "spotify-artist", state: genres.length ? "complete" : "empty" } satisfies ArtistGenreResponse, { headers });
    }
    if (result.unavailableArtistIds.includes(id)) {
      return NextResponse.json({ artistId: id, genres: [], source: "spotify-artist", state: "unavailable" } satisfies ArtistGenreResponse, { headers });
    }
    const error = result.error;
    if (error?.retryAfter) headers["Retry-After"] = error.retryAfter;
    return NextResponse.json({ artistId: id, genres: [], source: "spotify-artist", state: "error", error: { status: error?.status ?? 502, reason: error?.reason ?? "INCOMPLETE_COVERAGE" } } satisfies ArtistGenreResponse,
      { status: error?.status === 401 || error?.status === 403 || error?.status === 404 || error?.status === 429 ? error.status : 502, headers });
  } catch {
    return NextResponse.json({ artistId: id, genres: [], source: "spotify-artist", state: "error", error: { status: 502, reason: "NETWORK_ERROR" } } satisfies ArtistGenreResponse, { status: 502, headers });
  }
}
