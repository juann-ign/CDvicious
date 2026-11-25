import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { mockArtistReleases } from "@/mocks/artistCatalog";
import type { ReleaseGroup } from "@/types/artist";

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
    return NextResponse.json({ items: data.items, total: data.total, nextOffset: nextCatalogOffset(data) });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
