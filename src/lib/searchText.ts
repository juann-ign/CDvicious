import type { ArtistItem } from "@/types/artist";

// Matching only: displayed names and provider IDs always retain their originals.
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

// A single alternative for a provider that returned no results. Do not invent
// accented spellings or expand a name into an unbounded set of queries.
export function unaccentedSearchQuery(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function searchWords(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function matchesSearchText(query: string, ...values: string[]): boolean {
  const term = normalizeSearchText(query);
  if (!term) return true;
  const fields = values.map(normalizeSearchText);
  if (fields.some((field) => field.includes(term))) return true;
  const required = searchWords(term);
  const available = fields.flatMap(searchWords);
  return required.length > 0 && required.every((word) => available.some((candidate) => candidate.startsWith(word)));
}

type SearchAlbum = {
  id: string;
  name: string;
  artists: readonly Pick<ArtistItem, "id" | "name">[];
};

/** An explicit title wins over longer titles that merely share its words. */
export function exactAlbumSearch(album: SearchAlbum, query: string) {
  const words = searchWords(normalizeSearchText(query));
  const title = searchWords(normalizeSearchText(album.name));
  if (!title.length) return false;
  for (let start = 0; start <= words.length - title.length; start++) {
    if (!title.every((word, index) => word === words[start + index])) continue;
    const other = [...words.slice(0, start), ...words.slice(start + title.length)].join(" ");
    if (!other || album.artists.some(({ name }) => matchesSearchText(other, name))) return true;
  }
  return false;
}

// Album matches identify only the credited artist IDs. For a mixed query,
// require the title and that particular credit to explain all search words.
export function findAlbumArtistMatches(albums: readonly (SearchAlbum | null)[], query: string): ArtistItem[] {
  if (!normalizeSearchText(query)) return [];
  const found = new Map<string, ArtistItem>();
  for (const album of albums) {
    if (!album || typeof album.id !== "string" || !album.id || typeof album.name !== "string" || !album.name || !Array.isArray(album.artists)) continue;
    for (const artist of album.artists) {
      if (!artist || typeof artist.id !== "string" || !artist.id || typeof artist.name !== "string" || !artist.name || found.has(artist.id)) continue;
      if (matchesSearchText(query, artist.name) || !matchesSearchText(query, album.name, artist.name)) continue;
      found.set(artist.id, { id: artist.id, name: artist.name, images: [], matchedAlbum: { id: album.id, name: album.name } });
    }
  }
  return [...found.values()];
}

function artistMatchWeight(name: string, term: string): number {
  if (name === term) return 4;
  if (name.startsWith(term)) return 3;
  const required = searchWords(term);
  const available = searchWords(name);
  if (required.length > 0 && required.every((word) => available.some((candidate) => candidate.startsWith(word)))) return 2;
  return name.includes(term) ? 1 : 0;
}

/** Rank the candidates returned by the catalog. The provider still owns pagination. */
export function rankArtistMatches<T extends { id: string; name: string }>(items: readonly (T | null)[], query: string): T[] {
  const term = normalizeSearchText(query);
  const seen = new Set<string>();
  const ranked: { item: T; weight: number }[] = [];
  for (const item of items) {
    if (!item || typeof item.id !== "string" || !item.id || typeof item.name !== "string" || !item.name || seen.has(item.id)) continue;
    seen.add(item.id);
    ranked.push({ item, weight: artistMatchWeight(normalizeSearchText(item.name), term) });
  }
  return ranked.sort((a, b) => b.weight - a.weight).map(({ item }) => item);
}

/** Focus a shortlist only when the query supplies a clear name or ordered prefix. */
export function strongestArtistMatches<T extends { name: string }>(items: readonly T[], query: string): T[] | null {
  const words = searchWords(normalizeSearchText(query));
  const term = words.join(" ");
  if (term.length < 4) return null;

  const candidates = items.map((item) => ({ item, name: searchWords(normalizeSearchText(item.name)) }));
  const exact = candidates.filter(({ name }) => name.join(" ") === term);
  if (exact.length) return exact.map(({ item }) => item);

  // A short token or a single unfinished word can describe many artists.
  if (words.length < 2 || words[words.length - 1].length < 3) return null;
  const prefixes = candidates.filter(({ name }) => words.every((word, index) => name[index]?.startsWith(word)));
  if (!prefixes.length) return null;
  const noExtraWords = prefixes.filter(({ name }) => name.length === words.length);
  return (noExtraWords.length ? noExtraWords : prefixes).map(({ item }) => item);
}
