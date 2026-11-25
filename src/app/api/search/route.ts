import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { mockArtists } from "@/mocks/artistCatalog";
import mockCollection from "@/mocks/collection.json";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const type = params.get("type") ?? "album";
  const offset = catalogOffset(params.get("offset"), 1000);
  if (!q || !["album", "artist"].includes(type) || offset === null) {
    return NextResponse.json({ error: "INVALID_SEARCH" }, { status: 400 });
  }
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    if (type === "album") return NextResponse.json(mockCollection.filter((album) => `${album.name} ${album.artists.map((a) => a.name)}`.toLowerCase().includes(q.toLowerCase())).slice(0, 10));
    const all = mockArtists.filter((artist) => artist.name.toLowerCase().includes(q.toLowerCase()));
    return NextResponse.json({ items: all.slice(offset, offset + 10), total: all.length, nextOffset: offset + 10 < all.length ? offset + 10 : null });
  }
  try {
    const data = await catalogRequest(`search?${new URLSearchParams({ q, type, limit: String(CATALOG_PAGE_SIZE), offset: String(offset) })}`, "GET /v1/search", request.signal);
    if (data instanceof Response) return data;
    // Preserve the existing unwrapped album array response.
    if (type === "album") return NextResponse.json(data.albums?.items ?? []);
    const page = data.artists;
    return NextResponse.json({ items: page.items, total: page.total, nextOffset: page.offset + page.limit <= 1000 ? nextCatalogOffset(page) : null });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
