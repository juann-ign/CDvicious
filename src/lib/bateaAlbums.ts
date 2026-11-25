import type { AlbumItem } from "@/types/crate";

/** Both Batea presentations expose the same first shelf of saved albums. */
export const BATEA_SHELF_COUNT = 18;

export function bateaAlbums(albums: readonly AlbumItem[]) {
  return albums.slice(0, BATEA_SHELF_COUNT);
}
