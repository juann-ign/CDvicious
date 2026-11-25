import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE, catalogOffset, catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { mockArtists, mockArtistReleases } from "@/mocks/artistCatalog";
import mockCollection from "@/mocks/collection.json";
import { findAlbumArtistMatches, matchesSearchText, rankArtistMatches, searchWords, unaccentedSearchQuery } from "@/lib/searchText";
import type { ArtistItem, ReleaseGroup } from "@/types/artist";

const MAX_SEARCH_OFFSET = 1000;
const MAX_QUERY_LENGTH = 160;
const RELEASE_GROUPS: ReleaseGroup[] = ["album", "single", "compilation"];

function releaseSuggestions(query: string, artists: readonly (ArtistItem | null)[], albums: Parameters<typeof findAlbumArtistMatches>[0]) {
  const nameMatches = artists.filter((artist) => typeof artist?.name === "string" && matchesSearchText(query, artist.name));
  return rankArtistMatches([...nameMatches, ...findAlbumArtistMatches(albums, query)], query).slice(0, CATALOG_PAGE_SIZE);
}

function providerSuggestions(query: string, data: { artists?: { items?: unknown }; albums?: { items?: unknown } } | null) {
  const artists = Array.isArray(data?.artists?.items) ? data.artists.items : null;
  const albums = Array.isArray(data?.albums?.items) ? data.albums.items : null;
  return artists || albums ? releaseSuggestions(query, artists ?? [], albums ?? []) : null;
}

function releaseFallback(query: string, providerArtists: unknown) {
  const plain = unaccentedSearchQuery(query);
  const words = searchWords(query.normalize("NFC"));
  const artists = Array.isArray(providerArtists)
    ? providerArtists.flatMap((artist) => typeof artist?.id === "string" && typeof artist?.name === "string" ? [artist.name] : [])
    : [];
  const albumQuery = (artist: string, album: string) => ({ query: `artist:"${artist}" album:"${album}"`, types: "album" });
  for (let length = words.length - 1; length > 0 && artists.length; length--) {
    const artistPrefix = words.slice(0, length).join(" ");
    if (artists.some((name) => matchesSearchText(artistPrefix, name))) return albumQuery(artistPrefix, words.slice(length).join(" "));
    const artistSuffix = words.slice(-length).join(" ");
    if (artists.some((name) => matchesSearchText(artistSuffix, name))) return albumQuery(artistSuffix, words.slice(0, -length).join(" "));
  }
  if (plain !== query) return { query: plain, types: "artist,album" };
  if (words.length < 2) return null;
  // Keep one bounded alternate query for an abbreviated leading artist plus
  // a title. Only credited releases matching the original words are accepted.
  const split = Math.min(2, words.length - 1);
  return albumQuery(words.slice(0, split).join(" "), words[words.length - 1]);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const type = params.get("type") ?? "album";
  const scope = params.get("scope");
  const includeReleases = scope === "releases";
  const offset = catalogOffset(params.get("offset"), MAX_SEARCH_OFFSET);
  if (!q || q.length > MAX_QUERY_LENGTH || !["album", "artist"].includes(type) || offset === null
    || (scope !== null && (!includeReleases || type !== "artist" || offset !== 0))) {
    return NextResponse.json({ error: "INVALID_SEARCH" }, { status: 400 });
  }
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    if (type === "album") return NextResponse.json(mockCollection.filter((album) => matchesSearchText(q, album.name, ...album.artists.map((artist) => artist.name))).slice(0, CATALOG_PAGE_SIZE));
    if (includeReleases) {
      const mockReleases = mockArtists.flatMap(({ id }) => RELEASE_GROUPS.flatMap((group) => mockArtistReleases(id, group)));
      const items = releaseSuggestions(q, mockArtists, [...mockCollection, ...mockReleases]);
      return NextResponse.json({ items, total: items.length, nextOffset: null });
    }
    const all = rankArtistMatches(mockArtists.filter((artist) => matchesSearchText(q, artist.name)), q);
    const end = offset + CATALOG_PAGE_SIZE;
    return NextResponse.json({ items: all.slice(offset, end), total: all.length, nextOffset: end < all.length ? end : null });
  }
  try {
    const search = (query: string, types = type) => catalogRequest(`search?${new URLSearchParams({ q: query, type: types, limit: String(CATALOG_PAGE_SIZE), offset: String(offset) })}`, "GET /v1/search", request.signal);
    let data = await search(q, includeReleases ? "artist,album" : type);
    if (data instanceof Response) return data;
    // Preserve the existing unwrapped album array response.
    if (type === "album") return NextResponse.json(data.albums?.items ?? []);
    if (includeReleases) {
      let items = providerSuggestions(q, data);
      if (!items) return NextResponse.json({ error: "INVALID_SEARCH_PAGE" }, { status: 502 });
      let requests = 1;
      const alternate = !items.length && !request.signal.aborted ? releaseFallback(q, data.artists?.items) : null;
      if (alternate) {
        const result = await search(alternate.query, alternate.types);
        requests++;
        if (result instanceof Response) return result;
        items = providerSuggestions(q, result);
        if (!items) return NextResponse.json({ error: "INVALID_SEARCH_PAGE" }, { status: 502 });
      }
      return NextResponse.json({ items, total: items.length, nextOffset: null }, { headers: { "X-CDV-Search-Requests": String(requests) } });
    }
    let requests = 1;
    const fallback = unaccentedSearchQuery(q);
    // Spotify documents keyword search, not an accent-folding guarantee. An
    // empty accented query gets at most one unaccented alternative on the same
    // page; failures, rate limits and successful results never trigger retries.
    if (Array.isArray(data.artists?.items) && data.artists.items.length === 0 && fallback !== q && !request.signal.aborted) {
      data = await search(fallback);
      requests++;
      if (data instanceof Response) return data;
    }
    const page = data.artists;
    if (!Array.isArray(page?.items) || !Number.isSafeInteger(page.total) || page.total < 0) {
      return NextResponse.json({ error: "INVALID_ARTIST_PAGE" }, { status: 502 });
    }
    const next = nextCatalogOffset(page);
    if (next !== null && (!Number.isSafeInteger(next) || next <= offset)) {
      return NextResponse.json({ error: "INVALID_ARTIST_PAGE" }, { status: 502 });
    }
    return NextResponse.json({ items: rankArtistMatches<ArtistItem>(page.items, q), total: page.total, nextOffset: next !== null && next <= MAX_SEARCH_OFFSET ? next : null }, {
      headers: { "X-CDV-Search-Requests": String(requests) },
    });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
