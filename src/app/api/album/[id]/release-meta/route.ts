import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";

interface SpotifyAlbumDetails { name: string; artists?: { name: string }[]; release_date?: string; label?: string; genres?: string[]; }
interface MusicBrainzRelease { id: string; score?: number; date?: string; country?: string; }
interface MusicBrainzSearchResponse { releases?: MusicBrainzRelease[]; }
interface MusicBrainzReleaseLookup { date?: string; country?: string; "label-info"?: { "catalog-number"?: string; label?: { name?: string } }[]; media?: { format?: string }[]; }
interface LastFmResponse { album?: { toptags?: { tag?: { name?: string }[] } } }
interface ReleaseMeta { year?: string; label?: string; catalogNumber?: string; format?: string; country?: string; tags?: string[]; }

const META_CACHE = new Map<string, { expiresAt: number; value: ReleaseMeta }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let musicBrainzQueue = Promise.resolve();
let nextMusicBrainzAt = 0;

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function queueMusicBrainz<T>(task: () => Promise<T>) {
  const run = musicBrainzQueue.then(async () => {
    const wait = Math.max(0, nextMusicBrainzAt - Date.now());
    if (wait > 0) await sleep(wait);
    nextMusicBrainzAt = Date.now() + 1100;
    return task();
  });
  musicBrainzQueue = run.then(() => undefined, () => undefined);
  return run;
}
function quoteLucene(value: string) { return value.replace(/[\"]/g, "\$&"); }

async function getSpotifyAlbum(id: string, accessToken: string) {
  const res = await fetch("https://api.spotify.com/v1/albums/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + accessToken },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as SpotifyAlbumDetails;
}

async function getMusicBrainzRelease(artist: string, album: string) {
  return queueMusicBrainz(async () => {
    const query = 'artist:"' + quoteLucene(artist) + '" AND release:"' + quoteLucene(album) + '"';
    const searchRes = await fetch(
      "https://musicbrainz.org/ws/2/release/?query=" + encodeURIComponent(query) + "&limit=5&fmt=json",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "CDvicious/0.1 (github.com/juann-ign/CDvicious)",
        },
        next: { revalidate: 86400 },
      },
    );
    if (!searchRes.ok) return null;
    const searchData = (await searchRes.json()) as MusicBrainzSearchResponse;
    const candidate = (searchData.releases ?? []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    if (!candidate?.id) return null;

    await sleep(Math.max(0, nextMusicBrainzAt - Date.now()));
    nextMusicBrainzAt = Date.now() + 1100;

    const lookupRes = await fetch(
      "https://musicbrainz.org/ws/2/release/" + candidate.id + "?inc=labels+media&fmt=json",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "CDvicious/0.1 (github.com/juann-ign/CDvicious)",
        },
        next: { revalidate: 86400 },
      },
    );
    if (!lookupRes.ok) return null;
    return (await lookupRes.json()) as MusicBrainzReleaseLookup;
  });
}

async function getLastFmTags(artist: string, album: string) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];
  try {
    const params = new URLSearchParams({ method: "album.getTopTags", api_key: apiKey, artist, album, format: "json", autocorrect: "1" });
    const res = await fetch("https://ws.audioscrobbler.com/2.0/?" + params.toString(), { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const data = (await res.json()) as LastFmResponse;
    return (data.album?.toptags?.tag ?? []).map((tag) => tag.name?.trim()).filter((tag): tag is string => Boolean(tag)).slice(0, 3);
  } catch {
    return [];
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cached = META_CACHE.get(id);
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.value);

  const accessToken = await getValidAccessToken();
  if (!accessToken) return NextResponse.json({}, { status: 401 });

  try {
    const spotifyAlbum = await getSpotifyAlbum(id, accessToken);
    if (!spotifyAlbum) return NextResponse.json({}, { status: 502 });

    const artist = spotifyAlbum.artists?.[0]?.name ?? "";
    const album = spotifyAlbum.name ?? "";
    const [musicBrainz, lastFmTags] = await Promise.all([
      getMusicBrainzRelease(artist, album),
      getLastFmTags(artist, album),
    ]);

    const meta: ReleaseMeta = {
      year: musicBrainz?.date?.slice(0, 4) ?? spotifyAlbum.release_date?.slice(0, 4),
      label: musicBrainz?.["label-info"]?.[0]?.label?.name ?? spotifyAlbum.label,
      catalogNumber: musicBrainz?.["label-info"]?.find((info) => info["catalog-number"])?.["catalog-number"],
      format: musicBrainz?.media?.[0]?.format ?? "COMPACT DISC",
      country: musicBrainz?.country,
      tags: lastFmTags.length > 0 ? lastFmTags : spotifyAlbum.genres ?? [],
    };

    META_CACHE.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, value: meta });
    return NextResponse.json(meta);
  } catch {
    const fallback: ReleaseMeta = { format: "COMPACT DISC", tags: [] };
    META_CACHE.set(id, { expiresAt: Date.now() + CACHE_TTL_MS, value: fallback });
    return NextResponse.json(fallback);
  }
}
