import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchArtistGenres } from "@/lib/spotify";

const SPOTIFY_MAX_LIMIT = 50;
// Ceiling de seguridad, no un límite de producto — "colección completa" real
// puede tener cualquier tamaño, esto solo evita loop infinito si Spotify
// devolviera `next` de forma inconsistente.
const SAFETY_CEILING = 3000;

interface SpotifyArtistRef {
  id: string;
  name: string;
}

interface SpotifyAlbum {
  id: string;
  name: string;
  uri: string;
  release_date: string;
  label?: string;
  images: { url: string; width: number; height: number }[];
  artists: SpotifyArtistRef[];
}

interface SpotifySavedAlbumItem {
  album: SpotifyAlbum;
}

interface SpotifySavedAlbumsResponse {
  items?: SpotifySavedAlbumItem[];
  next?: string | null;
}

// Cache en memoria del proceso: los géneros de un artista casi nunca cambian,
// así que evitamos re-pedirlos en cada carga de /crate. Se resetea si el
// server reinicia — aceptable para este proyecto, no hay DB persistente.
const genreCache = new Map<string, string[]>();

export async function GET() {
  const session = await getSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Falta sesión" }, { status: 400 });
  }

  const allAlbums: SpotifyAlbum[] = [];
  let offset = 0;
  let hasMore = true;

  try {
    while (hasMore && allAlbums.length < SAFETY_CEILING) {
      const res = await fetch(
        `https://api.spotify.com/v1/me/albums?limit=${SPOTIFY_MAX_LIMIT}&offset=${offset}`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );

      if (!res.ok) break;

      const data = (await res.json()) as SpotifySavedAlbumsResponse;
      const items = data.items ?? [];

      allAlbums.push(...items.map((item) => item.album));

      hasMore = Boolean(data.next);
      offset += SPOTIFY_MAX_LIMIT;
    }

    const allArtistIds = allAlbums.flatMap((a) => a.artists.map((ar) => ar.id));
    const uncachedIds = allArtistIds.filter((id) => !genreCache.has(id));

    if (uncachedIds.length > 0) {
      const fetched = await fetchArtistGenres(session.accessToken, uncachedIds);
      for (const [id, genres] of Object.entries(fetched)) {
        genreCache.set(id, genres);
      }
    }

    const withGenres = allAlbums.map((album) => {
      const genres = Array.from(
        new Set(album.artists.flatMap((ar) => genreCache.get(ar.id) ?? [])),
      );
      return { ...album, genres };
    });

    return NextResponse.json(withGenres);
  } catch {
    return NextResponse.json(allAlbums);
  }
}
