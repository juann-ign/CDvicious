import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { mockArtists } from "@/mocks/artistCatalog";
import mockCollection from "@/mocks/collection.json";
import { normalizeSearchText, unaccentedSearchQuery } from "@/lib/searchText";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const type = params.get("type") ?? "album";
  const offset = catalogOffset(params.get("offset"), 1000);
  if (!q || !["album", "artist"].includes(type) || offset === null) {
    return NextResponse.json({ error: "INVALID_SEARCH" }, { status: 400 });
  }
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const term = normalizeSearchText(q);
    if (type === "album") return NextResponse.json(mockCollection.filter((album) => normalizeSearchText(`${album.name} ${album.artists.map((a) => a.name)}`).includes(term)).slice(0, 10));
    const all = mockArtists.filter((artist) => normalizeSearchText(artist.name).includes(term));
    return NextResponse.json({ items: all.slice(offset, offset + 10), total: all.length, nextOffset: offset + 10 < all.length ? offset + 10 : null });
  }
  try {
    const search = (query: string) => catalogRequest(`search?${new URLSearchParams({ q: query, type, limit: String(CATALOG_PAGE_SIZE), offset: String(offset) })}`, "GET /v1/search", request.signal);
    let data = await search(q);
    if (data instanceof Response) return data;
    // Preserve the existing unwrapped album array response.
    if (type === "album") return NextResponse.json(data.albums?.items ?? []);
    let requests = 1;
    const fallback = unaccentedSearchQuery(q);
    // Spotify documents keyword search, not an accent-folding guarantee. An
    // empty accented query gets at most one unaccented alternative on the same
    // page; failures, rate limits and successful results never trigger retries.
    if (Array.isArray(data.artists?.items) && data.artists.items.length === 0 && fallback !== q && !request.signal.aborted) {
      data = await search(fallback);
      requests++;
      if (data instanceof Response) return data;
    }
    const page = data.artists;
    return NextResponse.json({ items: page.items, total: page.total, nextOffset: page.offset + page.limit <= 1000 ? nextCatalogOffset(page) : null }, {
      headers: { "X-CDV-Search-Requests": String(requests) },
    });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
