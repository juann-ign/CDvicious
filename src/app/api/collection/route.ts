import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const SPOTIFY_MAX_LIMIT = 50; // límite máximo permitido por Spotify por request
const MAX_ALBUMS = 120; // techo total: ~5 páginas de 24 en la batea

export async function GET() {
  const session = await getSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Falta sesión" }, { status: 400 });
  }

  const allAlbums: any[] = [];
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

      const data = await res.json();
      const items = data.items || [];
      allAlbums.push(...items.map((item: any) => item.album));

      hasMore = Boolean(data.next);
      offset += SPOTIFY_MAX_LIMIT;
    }

    // Por si el último batch se pasó del techo (ej. traer 50 cuando faltaban 10)
    return NextResponse.json(allAlbums.slice(0, MAX_ALBUMS));
  } catch {
    return NextResponse.json(allAlbums.slice(0, MAX_ALBUMS));
  }
}
