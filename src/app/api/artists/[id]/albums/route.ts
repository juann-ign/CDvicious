import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { mockArtistReleases } from "@/mocks/artistCatalog";
import type { ArtistRelease, ReleaseGroup } from "@/types/artist";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const group = query.get("group") ?? "album";
  const offset = catalogOffset(query.get("offset"));
  if (!/^[a-zA-Z0-9-]+$/.test(id) || !["album", "single", "compilation"].includes(group) || offset === null) {
    return NextResponse.json({ error: "INVALID_CATALOG_REQUEST" }, { status: 400 });
  }
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const all = mockArtistReleases(id, group as ReleaseGroup);
    return NextResponse.json({ items: all.slice(offset, offset + CATALOG_PAGE_SIZE), total: all.length, nextOffset: offset + CATALOG_PAGE_SIZE < all.length ? offset + CATALOG_PAGE_SIZE : null });
  }
  try {
    const data = await catalogRequest(`artists/${encodeURIComponent(id)}/albums?${new URLSearchParams({ include_groups: group, limit: String(CATALOG_PAGE_SIZE), offset: String(offset) })}`, "GET /v1/artists/:id/albums", request.signal);
    if (data instanceof Response) return data;
    if (!Array.isArray(data?.items) || !Number.isSafeInteger(data.total) || data.total < 0) {
      return NextResponse.json({ error: "INVALID_ALBUM_PAGE" }, { status: 502 });
    }
    const nextOffset = nextCatalogOffset(data);
    if (nextOffset !== null && (!Number.isSafeInteger(nextOffset) || nextOffset <= offset)) {
      return NextResponse.json({ error: "INVALID_ALBUM_PAGE" }, { status: 502 });
    }
    const items = new Map<string, ArtistRelease>();
    for (const album of data.items as (ArtistRelease | null)[]) {
      if (!album || typeof album.id !== "string" || !album.id || album.album_group === "appears_on" || items.has(album.id)) continue;
      items.set(album.id, album);
    }
    // Keep edition dates, cover and artist credits as supplied; genre coverage
    // is fetched by artist ID from its own endpoint, independently of pages.
    return NextResponse.json({ items: [...items.values()], total: data.total, nextOffset });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
