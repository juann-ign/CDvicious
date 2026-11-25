import type { AlbumItem } from "@/types/crate";

/** Limit the regular shelf to the first saved editions. */
export const BATEA_SHELF_COUNT = 18;

const DEMO_START = [
  "demo-vertice-album-0", "mock-album-01",
  "demo-satelite-album-1", "mock-album-02",
  "demo-inerciales-album-0", "mock-album-03",
];

export function bateaAlbums(albums: readonly AlbumItem[]) {
  const shelf = albums.slice(0, BATEA_SHELF_COUNT);
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK !== "1") return shelf;

  const byId = new Map(albums.map((album) => [album.id, album]));
  const featured = DEMO_START.flatMap((id) => {
    const album = byId.get(id);
    return album ? [album] : [];
  });
  const featuredIds = new Set(featured.map((album) => album.id));
  return [...featured, ...shelf.filter((album) => !featuredIds.has(album.id))];
}
