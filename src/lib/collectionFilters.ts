import type { AlbumItem } from "@/types/crate";

export type CollectionFilterOption = { id: string; label: string; count: number };

const nonemptyText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
export function isCollectionAlbum(value: unknown): value is AlbumItem {
  if (!value || typeof value !== "object") return false;
  const album = value as Record<string, unknown>;
  return nonemptyText(album.id) && nonemptyText(album.name) && nonemptyText(album.uri)
    && Array.isArray(album.artists) && album.artists.every((artist: unknown) => artist && typeof artist === "object"
      && nonemptyText((artist as Record<string, unknown>).id) && nonemptyText((artist as Record<string, unknown>).name))
    && Array.isArray(album.images) && album.images.every((image: unknown) => image && typeof image === "object"
      && nonemptyText((image as Record<string, unknown>).url));
}

export function normalizeCollectionAlbum(album: AlbumItem): AlbumItem {
  return { ...album, release_date: typeof album.release_date === "string" ? album.release_date : undefined, genres: normalizeGenres(album.genres) };
}

export function normalizeGenres(values: unknown): string[] {
  const entries: unknown[] = Array.isArray(values) ? values : [];
  return [...new Set(entries.filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase()).filter(Boolean))];
}

// Spotify dates have year, month or day precision. Reject malformed calendar
// values instead of silently assigning them to an older decade.
export function collectionDecade(date: unknown): string {
  if (typeof date !== "string") return "unknown";
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(date);
  if (!match) return "unknown";
  const year = Number(match[1]);
  const month = match[2] === undefined ? 1 : Number(match[2]);
  const day = match[3] === undefined ? 1 : Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return "unknown";
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1] ? `${Math.floor(year / 10) * 10}s` : "unknown";
}

export function collectionDecades(albums: readonly AlbumItem[]): CollectionFilterOption[] {
  const counts = new Map<string, number>();
  for (const album of albums) {
    const decade = collectionDecade(album.release_date);
    counts.set(decade, (counts.get(decade) ?? 0) + 1);
  }
  return [{ id: "all", label: "TODAS", count: albums.length }, ...[...counts.keys()]
    .filter((decade) => decade !== "unknown").sort((a, b) => Number.parseInt(b) - Number.parseInt(a))
    .map((id) => ({ id, label: id, count: counts.get(id)! })),
  ...(counts.has("unknown") ? [{ id: "unknown", label: "SIN FECHA", count: counts.get("unknown")! }] : [])];
}

export function collectionGenres(albums: readonly AlbumItem[]): CollectionFilterOption[] {
  const counts = new Map<string, number>();
  for (const album of albums) for (const genre of normalizeGenres(album.genres)) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, label: id.toLocaleUpperCase(), count }));
}

export function filterCollection(albums: readonly AlbumItem[], query: string, decade: string, genre: string): AlbumItem[] {
  const term = query.trim().toLocaleLowerCase();
  const normalizedGenre = normalizeGenres([genre])[0];
  return albums.filter((album) => (!term || album.name.toLocaleLowerCase().includes(term) || album.artists.some((artist) => artist.name.toLocaleLowerCase().includes(term)))
    && (decade === "all" || collectionDecade(album.release_date) === decade)
    && (genre === "all" || normalizeGenres(album.genres).includes(normalizedGenre)));
}
