import { NextResponse } from "next/server";
import { catalogRequest, nextCatalogOffset } from "@/lib/catalogServer";
import { getMockTracks } from "@/mocks/demoCatalog";
import type { AlbumTrack } from "@/types/crate";

const PAGE_SIZE = 50;

interface SpotifyTrackItem {
  id?: string | null;
  uri?: string;
  name?: string;
  duration_ms?: number;
  track_number?: number;
  disc_number?: number;
  is_local?: boolean;
  is_playable?: boolean;
  linked_from?: { id?: string };
  restrictions?: { reason?: string };
}

function positiveInteger(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function albumTrack(item: SpotifyTrackItem | null, position: number): AlbumTrack {
  const id = typeof item?.id === "string" && item.id ? item.id : null;
  const uri = typeof item?.uri === "string" && item.uri.startsWith("spotify:track:") ? item.uri : null;
  return {
    id,
    uri,
    name: item?.name || `Pista ${position + 1}`,
    duration_ms: positiveInteger(item?.duration_ms, 0),
    track_number: positiveInteger(item?.track_number, position + 1),
    disc_number: positiveInteger(item?.disc_number, 1),
    position,
    playable: Boolean(id && uri && !item?.is_local && item?.is_playable !== false && !item?.restrictions?.reason),
    linkedFromId: item?.linked_from?.id,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "INVALID_CATALOG_REQUEST" }, { status: 400 });
  }

  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json({
      tracks: getMockTracks(id).map((track, position) => ({ ...track, disc_number: 1, position, playable: true })),
    });
  }

  try {
    const tracks: AlbumTrack[] = [];
    let offset = 0;
    for (;;) {
      const data = await catalogRequest(`albums/${encodeURIComponent(id)}/tracks?limit=${PAGE_SIZE}&offset=${offset}`,
        "GET /v1/albums/:id/tracks", request.signal);
      if (data instanceof Response) return data;
      if (!Array.isArray(data.items)) return NextResponse.json({ error: "INVALID_TRACK_PAGE" }, { status: 502 });
      tracks.push(...data.items.map((item: SpotifyTrackItem | null, index: number) => albumTrack(item, offset + index)));

      // Build each request locally rather than passing the access token to a
      // provider-supplied URL. Never return a deceptively partial tracklist.
      const next = nextCatalogOffset(data);
      if (next === null) break;
      if (!data.items.length || !Number.isSafeInteger(next) || next <= offset) {
        return NextResponse.json({ error: "INVALID_TRACK_PAGE" }, { status: 502 });
      }
      offset = next;
    }
    tracks.sort((a, b) => a.disc_number - b.disc_number || a.track_number - b.track_number || a.position - b.position);
    return NextResponse.json({ tracks });
  } catch {
    return NextResponse.json({ error: "NETWORK_ERROR" }, { status: 502 });
  }
}
