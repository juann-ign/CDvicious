import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";

export async function GET() {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "Falta sesión" }, { status: 400 });
  }

  // Traemos los últimos 20 álbumes guardados
  const res = await fetch(`https://api.spotify.com/v1/me/albums?limit=40`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await res.json();

  // La API de Spotify envuelve los álbumes en un objeto { added_at, album: { ... } }
  // Los extraemos para que el frontend reciba exactamente la misma estructura que en la búsqueda
  const formattedAlbums = data.items?.map((item: any) => item.album) || [];

  return NextResponse.json(formattedAlbums);
}
