import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const SPOTIFY_MAX_LIMIT = 50;
const MAX_ALBUMS = 120;

interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  images: {
    url: string;
    width: number;
    height: number;
  }[];
  artists: {
    name: string;
  }[];
}

interface SpotifySavedAlbumItem {
  album: SpotifyAlbum;
}

interface SpotifySavedAlbumsResponse {
  items?: SpotifySavedAlbumItem[];
  next?: string | null;
}

export async function GET() {
  const session = await getSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Falta sesión" }, { status: 400 });
  }

  const allAlbums: SpotifyAlbum[] = [];
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore && allAlbums.length < MAX_ALBUMS) {
      const res = await fetch(
        `https://api.spotify.com/v1/me/albums?limit=${SPOTIFY_MAX_LIMIT}&offset=${offset}`,
        {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        },
      );

      if (!res.ok) {
        break;
      }

      const data = (await res.json()) as SpotifySavedAlbumsResponse;
      const items = data.items ?? [];

      allAlbums.push(...items.map((item) => item.album));

      hasMore = Boolean(data.next);
      offset += SPOTIFY_MAX_LIMIT;
    }

    return NextResponse.json(allAlbums.slice(0, MAX_ALBUMS));
  } catch {
    return NextResponse.json(allAlbums.slice(0, MAX_ALBUMS));
  }
}
