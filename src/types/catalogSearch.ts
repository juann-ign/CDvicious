import type { ArtistItem } from "./artist";
import type { AlbumItem } from "./crate";

export interface CatalogSearchResult {
  kind: "artist" | "album" | "mixed" | "empty";
  artists: ArtistItem[];
  albums: AlbumItem[];
}
