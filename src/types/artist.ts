import type { AlbumItem } from "./crate";

export type ReleaseGroup = "album" | "single" | "compilation";
export interface ArtistItem {
  id: string;
  name: string;
  images: AlbumItem["images"];
  genres?: string[];
  external_urls?: { spotify?: string };
  matchedAlbum?: { id: string; name: string };
}
export interface ArtistRelease extends AlbumItem {
  album_group?: ReleaseGroup | "appears_on";
  album_type?: ReleaseGroup;
  release_date_precision?: "year" | "month" | "day";
  external_urls?: { spotify?: string };
  artworkSource?: "demo";
}
export interface CatalogPage<T> {
  items: T[];
  total: number;
  nextOffset: number | null;
}
