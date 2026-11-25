import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { CATALOG_PAGE_SIZE } from "@/lib/catalogServer";
import { normalizeGenres } from "@/lib/collectionFilters";
import { getValidAccessToken } from "@/lib/session";
import { fetchSpotifyWebApi } from "@/lib/spotify";
import { mockArtists } from "@/mocks/artistCatalog";
import mockCollection from "@/mocks/collection.json";

type ArtistCandidate = { id: string; name: string };

const MAX_ARTISTS = 24;
const CONCURRENCY = 2;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 512;
const MAX_SEARCH_PAGES = 3;
const MAX_SEARCH_REQUESTS = 24;
const MAX_SEARCH_OFFSET = 1000;
const checkedCache = new Map<string, { matches: boolean; expiresAt: number }>();
type SearchProgress = { ids: Set<string>; nextOffset: number | null; exhaustive: boolean; blocked: boolean; expiresAt: number };
const searchCache = new Map<string, SearchProgress>();

function storeProgress(key: string, progress: SearchProgress) {
  if (searchCache.size >= MAX_CACHE_ENTRIES && !searchCache.has(key)) {
    const oldest = searchCache.keys().next().value;
    if (oldest !== undefined) searchCache.delete(oldest);
  }
  // A stalled/malformed page blocks this invocation only. A manual retry may
  // re-read that offset without discarding the IDs already supplied.
  searchCache.set(key, { ...progress, blocked: false, ids: new Set(progress.ids), expiresAt: Date.now() + CACHE_TTL_MS });
}

function readInput(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { genre: rawGenre, artists: rawArtists } = value as { genre?: unknown; artists?: unknown };
  if (typeof rawGenre !== "string" || !Array.isArray(rawArtists) || rawArtists.length > MAX_ARTISTS) return null;
  const genre = normalizeGenres([rawGenre.normalize("NFC")])[0];
  // These are search terms, not the provider's query language. Neither input
  // can supply delimiter, escaping, wildcard or additional field syntax.
  if (!genre || genre.length > 60 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} .&/'’-]*$/u.test(genre)) return null;
  const artists = new Map<string, ArtistCandidate>();
  for (const entry of rawArtists) {
    if (typeof entry?.id !== "string" || !/^[A-Za-z0-9-]{1,64}$/.test(entry.id) || typeof entry.name !== "string") return null;
    const name = entry.name.normalize("NFC").trim().replace(/\s+/g, " ");
    if (!name || name.length > 160) return null;
    if (!artists.has(entry.id)) artists.set(entry.id, { id: entry.id, name });
  }
  return { genre, artists: [...artists.values()] };
}

function searchName(name: string) {
  return name.replace(/[^\p{L}\p{N}\p{M} .&/'’-]+/gu, " ").replace(/\s+/g, " ").trim();
}

function getCached(key: string): boolean | undefined {
  const entry = checkedCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.matches;
  checkedCache.delete(key);
  return undefined;
}

function storeChecked(key: string, matches: boolean) {
  if (checkedCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = checkedCache.keys().next().value;
    if (oldest !== undefined) checkedCache.delete(oldest);
  }
  checkedCache.set(key, { matches, expiresAt: Date.now() + CACHE_TTL_MS });
}

function mockMatches(artists: ArtistCandidate[], genre: string) {
  const byArtist = new Map(mockArtists.map((artist) => [artist.id, normalizeGenres(artist.genres)]));
  for (const album of mockCollection) {
    for (const artist of album.artists) {
      byArtist.set(artist.id, normalizeGenres([...(byArtist.get(artist.id) ?? []), ...album.genres]));
    }
  }
  const results = new Map<string, boolean>();
  for (const { id } of artists) {
    const genres = byArtist.get(id);
    if (genres) results.set(id, genres.includes(genre));
  }
  return results;
}

function reply(genre: string, artists: ArtistCandidate[], checked: Map<string, boolean>, retryAfter?: number, errorStatus?: number) {
  return NextResponse.json({
    genre,
    matchedArtistIds: artists.filter(({ id }) => checked.get(id) === true).map(({ id }) => id),
    checkedArtistIds: artists.filter(({ id }) => checked.has(id)).map(({ id }) => id),
    partial: checked.size < artists.length,
  }, { headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}), ...(errorStatus ? { "X-CDV-Genre-Error-Status": String(errorStatus) } : {}) } });
}

export async function POST(request: Request) {
  const input = readInput(await request.json().catch(() => null));
  if (!input) return NextResponse.json({ error: "INVALID_GENRE_REQUEST" }, { status: 400 });
  const { artists, genre } = input;

  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") return reply(genre, artists, mockMatches(artists, genre));

  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  const identity = createHash("sha256").update(token).digest("hex");
  const checked = new Map<string, boolean>();
  const pending = artists.flatMap((artist) => {
    const key = JSON.stringify([identity, genre, artist.id, artist.name]);
    const cached = getCached(key);
    if (cached === undefined) return [{ artist, key }];
    checked.set(artist.id, cached);
    return [];
  });
  const genreTerm = /^[\p{L}\p{N}\p{M}-]+$/u.test(genre) ? genre : `"${genre}"`;
  let index = 0;
  let halted = false;
  let failures = 0;
  let retryAfter = 0;
  let errorStatus = 0;
  let requests = 0;
  const queries = new Map<string, Promise<SearchProgress>>();
  const artistQueries = new Map<string, { queries: string[]; original: boolean }>();
  const targets = new Map<string, Set<string>>();
  for (const { artist } of pending) {
    const name = searchName(artist.name);
    if (!/[\p{L}\p{N}]/u.test(name)) continue;
    const accentFree = name.normalize("NFD").replace(/\p{M}/gu, "");
    const names = [...new Set([name, accentFree])];
    const terms = names.map((value) => {
      const term = /^[\p{L}\p{N}\p{M}]+$/u.test(value) && !/^(?:and|or|not)$/i.test(value) ? value : `"${value}"`;
      return `${term} genre:${genreTerm}`;
    });
    artistQueries.set(artist.id, { queries: terms, original: name === artist.name });
    for (const term of terms) {
      const ids = targets.get(term) ?? new Set<string>();
      ids.add(artist.id);
      targets.set(term, ids);
    }
  }

  const search = (term: string): Promise<SearchProgress> => {
    const inFlight = queries.get(term);
    if (inFlight) return inFlight;
    const searchKey = JSON.stringify([identity, term]);
    const cached = searchCache.get(searchKey);
    if (cached && cached.expiresAt <= Date.now()) searchCache.delete(searchKey);
    const progress: SearchProgress = cached && cached.expiresAt > Date.now()
      ? { ...cached, ids: new Set(cached.ids) }
      : { ids: new Set(), nextOffset: 0, exhaustive: false, blocked: false, expiresAt: 0 };
    const lookup = (async () => {
      let pages = 0;
      while (pages < MAX_SEARCH_PAGES && requests < MAX_SEARCH_REQUESTS && !halted && !request.signal.aborted
        && progress.nextOffset !== null && !progress.blocked && ![...(targets.get(term) ?? [])].every((id) => progress.ids.has(id))) {
        const offset = progress.nextOffset;
        const query = new URLSearchParams({ type: "artist", q: term, limit: String(CATALOG_PAGE_SIZE), ...(offset ? { offset: String(offset) } : {}) });
        pages++;
        requests++;
        try {
          const response = await fetchSpotifyWebApi(token, "GET /v1/search", `https://api.spotify.com/v1/search?${query}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: request.signal,
          });
          if (!response.ok) {
            failures++;
            errorStatus ||= response.status;
            if ([401, 403, 429].includes(response.status)) { halted = true; errorStatus = response.status; }
            if (response.status === 429) {
              const seconds = Number(response.headers.get("retry-after"));
              retryAfter = Math.max(retryAfter, Number.isSafeInteger(seconds) && seconds > 0 ? seconds : 1);
            }
            break;
          }
          const page = (await response.json())?.artists;
          if (!Array.isArray(page?.items)) { failures++; break; }
          const validIds = page.items.every((item: { id?: string } | null) => typeof item?.id === "string" && item.id);
          const previousSize = progress.ids.size;
          for (const item of page.items as ({ id?: string } | null)[]) if (typeof item?.id === "string" && item.id) progress.ids.add(item.id);
          const validPage = validIds && page.offset === offset && Number.isSafeInteger(page.limit) && page.limit > 0 && page.limit <= CATALOG_PAGE_SIZE
            && Number.isSafeInteger(page.total) && page.total >= 0 && page.items.length <= page.limit;
          progress.exhaustive = validPage && page.next === null && page.total <= offset + page.items.length;
          if (progress.exhaustive) progress.nextOffset = null;
          else if (validPage && typeof page.next === "string" && page.next && page.items.length > 0
            && progress.ids.size > previousSize && page.total > offset + page.items.length && offset + page.limit <= MAX_SEARCH_OFFSET) {
            progress.nextOffset = offset + page.limit;
          } else progress.blocked = true;
          // Cache only supplied ID evidence and pagination progress, never a
          // failed request or a negative inferred from a truncated page.
          storeProgress(searchKey, progress);
        } catch {
          failures++;
          break;
        }
      }
      return progress;
    })();
    queries.set(term, lookup);
    return lookup;
  };

  const checkArtists = async () => {
    while (index < pending.length && !halted && !request.signal.aborted) {
      const { artist, key } = pending[index++];
      const lookup = artistQueries.get(artist.id);
      if (!lookup) continue;
      let exhaustive = lookup.original;
      let matches = false;
      for (const term of lookup.queries) {
        const result = await search(term);
        if (result.ids.has(artist.id)) { matches = true; break; }
        exhaustive &&= result.exhaustive;
      }
      if (matches || exhaustive) {
        checked.set(artist.id, matches);
        storeChecked(key, matches);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(pending.length, CONCURRENCY) }, checkArtists));
  if (!checked.size && retryAfter) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  if (!checked.size && failures > 0) {
    return NextResponse.json({ error: "GENRE_VERIFICATION_FAILED" }, { status: errorStatus === 401 || errorStatus === 403 ? errorStatus : 502 });
  }
  return reply(genre, artists, checked, retryAfter, errorStatus);
}
