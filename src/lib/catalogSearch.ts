import type { ArtistItem } from "@/types/artist";
import type { AlbumItem } from "@/types/crate";
import type { CatalogSearchResult } from "@/types/catalogSearch";
import { collectionYear, isCollectionAlbum } from "./collectionFilters";
import { exactAlbumSearch, findAlbumArtistMatches, matchesSearchText, normalizeSearchText, rankArtistMatches, searchWords, strongestArtistMatches } from "./searchText";

function nameWords(value: string) {
  return searchWords(normalizeSearchText(value)).join(" ");
}

function isArtistProfile(value: unknown): value is ArtistItem {
  if (!value || typeof value !== "object") return false;
  const { id, name, images } = value as Record<string, unknown>;
  return typeof id === "string" && Boolean(id) && typeof name === "string" && Boolean(name)
    && Array.isArray(images) && images.every((image) => typeof image?.url === "string" && image.url);
}

function isAlbumEdition(album: AlbumItem) {
  return !("album_type" in album) || album.album_type === "album";
}

function corroboratedProviderArtist(query: string, firstProfile: unknown, names: ArtistItem[], providerAlbums: readonly unknown[]) {
  if (!isArtistProfile(firstProfile) || !names.some(({ id }) => id === firstProfile.id)) return null;
  const words = nameWords(query).split(" ");
  const profileWords = nameWords(firstProfile.name).split(" ");
  const last = words.length - 1;
  if (last < 1 || words[last].length < 3 || !profileWords[last]?.startsWith(words[last])
    || !words.slice(0, last).every((word, index) => word === profileWords[index])) return null;
  if (profileWords.length > words.length && profileWords[last] !== words[last]) return null;

  // Spotify's first exact prefix can win over a nearby homonym when distinct
  // albums high in the same response confirm the credited ID.
  const sample = new Map<string, AlbumItem>();
  for (const album of providerAlbums) {
    if (isCollectionAlbum(album) && isAlbumEdition(album) && !sample.has(album.id)) sample.set(album.id, album);
    if (sample.size === 3) break;
  }
  const credits = (id: string) => [...sample.values()].filter((album) => album.artists.some((artist) => artist.id === id)).length;
  const leadCredits = credits(firstProfile.id);
  return leadCredits >= 2 && names.every(({ id }) => id === firstProfile.id || credits(id) < leadCredits) ? firstProfile : null;
}

export function catalogSearchMatches(query: string, providerArtists: readonly unknown[], providerAlbums: readonly unknown[], limit: number, providerRanked = false): CatalogSearchResult {
  const term = nameWords(query);
  if (!term) return { kind: "empty", artists: [], albums: [] };

  const profiles = new Map(providerArtists.filter(isArtistProfile).map((artist) => [artist.id, artist]));
  const creditedByName = new Map<string, ArtistItem>();
  const artistReleases = new Map<string, AlbumItem>();
  const releases = new Map<string, { album: AlbumItem; exact: boolean; title: boolean }>();
  for (const album of providerAlbums) {
    if (!isCollectionAlbum(album) || releases.has(album.id)) continue;
    const title = matchesSearchText(query, album.name);
    let mixed = false;
    for (const artist of album.artists) {
      if (matchesSearchText(query, artist.name)) {
        creditedByName.set(artist.id, profiles.get(artist.id) ?? { ...artist, images: [] });
        artistReleases.set(album.id, album);
      } else if (matchesSearchText(query, album.name, artist.name)) {
        mixed = true;
      }
    }
    if (title || mixed) releases.set(album.id, { album, exact: exactAlbumSearch(album, query), title });
  }

  const direct = rankArtistMatches([...profiles.values()].filter(({ name }) => matchesSearchText(query, name)), query);
  const names = direct.length ? direct : rankArtistMatches([...creditedByName.values()], query);
  const ranked = [...releases.values()].sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.title) - Number(a.title));
  const albums = ranked.slice(0, limit).map(({ album }) => album);
  const credits = findAlbumArtistMatches(albums, query).map((artist) => ({ ...artist, ...profiles.get(artist.id) }));
  const artists = rankArtistMatches([...names, ...credits], query).slice(0, limit);

  if (ranked.some(({ exact, title }) => exact && title)) return { kind: "album", artists, albums };
  const mixed = ranked.some(({ title }) => !title);
  if (names.length && (!mixed || names.some(({ name }) => nameWords(name) === term))) {
    const providerLead = providerRanked ? corroboratedProviderArtist(query, providerArtists[0], names, providerAlbums) : null;
    const focused = providerLead ? [providerLead] : strongestArtistMatches(names, query);
    const lead = focused?.[0]?.id ?? names[0].id;
    const related = [...artistReleases.values()].filter((album) => isAlbumEdition(album) && album.artists.some(({ id }) => id === lead));
    return { kind: "artist", artists: focused?.slice(0, limit) ?? artists, albums: related.slice(0, limit) };
  }
  if (mixed) return { kind: "mixed", artists, albums };
  return { kind: albums.length ? "album" : "empty", artists, albums };
}

// The preview samples one provider page. Keep edition identities and sort
// known release dates before entries whose dates cannot be parsed.
export function catalogArtistPreview(albums: readonly unknown[], artistId: string): AlbumItem[] {
  const unique = new Map<string, AlbumItem>();
  for (const album of albums) {
    if (isCollectionAlbum(album) && album.artists.some(({ id }) => id === artistId) && !unique.has(album.id)) unique.set(album.id, album);
  }
  const sortDate = ({ release_date: date }: AlbumItem) => date && collectionYear(date) !== "unknown" ? date : "\uffff";
  return [...unique.values()].sort((a, b) => sortDate(a).localeCompare(sortDate(b)) || a.id.localeCompare(b.id)).slice(0, 3);
}
