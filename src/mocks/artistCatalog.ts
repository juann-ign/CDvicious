import type { ArtistItem, ArtistRelease, ReleaseGroup } from "@/types/artist";
import mockCollection from "@/mocks/collection.json";

export const mockArtists: ArtistItem[] = [
  { id: "demo-vertice", name: "Vértice Magnético", images: [], genres: ["indie", "electronic"] },
  { id: "demo-satelite", name: "Satélite Sur", images: [], genres: ["electronic", "ambient"] },
  { id: "demo-beatles", name: "The Beatles", images: [], genres: ["rock"] },
  { id: "demo-empty", name: "Archivo sin editar", images: [], genres: [] },
  { id: "demo-inerciales", name: "Los Inerciales", images: [], genres: ["post-punk", "rock"] },
];
const collectionArtists: Record<string, string> = {
  "mock-artist-01": "demo-vertice",
  "mock-artist-02": "demo-satelite",
  "mock-artist-03": "demo-inerciales",
};
const titles = ["Campo magnético", "Frecuencia cero", "Órbita interior", "Luz residual", "Memoria de plata", "Ruido blanco", "Lado nocturno", "Circuitos", "Otra frecuencia", "Transmisión", "Señal abierta", "Última órbita"];
export function mockArtistReleases(artistId: string, group: ReleaseGroup): ArtistRelease[] {
  const canonicalId = collectionArtists[artistId] ?? artistId;
  const artist = mockArtists.find((item) => item.id === canonicalId);
  if (!artist || artist.id === "demo-empty") return [];
  const count = group === "album" ? 27 : group === "single" ? 13 : 3;
  const releases: ArtistRelease[] = Array.from({ length: count }, (_, index) => ({
    id: `${canonicalId}-${group}-${index}`,
    name: canonicalId === "demo-inerciales" && group === "album" && index === 0 ? "Andenes" : `${titles[index % titles.length]}${index >= titles.length ? ` / ${Math.floor(index / titles.length) + 1}` : ""}`,
    uri: `spotify:album:${canonicalId}-${group}-${index}`,
    artists: [{ id: artist.id, name: artist.name }],
    release_date: `${1994 + index}-04-12`, release_date_precision: "day",
    album_type: group, album_group: group,
    images: index === 8 ? [] : [{ url: `/images/discography/demo-${index % 3}.png`, width: 800, height: 800 }],
    artworkSource: "demo", label: "CDvicious · catálogo ficticio de prueba",
    genres: artist.genres,
  }));
  // Collection keeps its original artist IDs. Its entry point also exposes the
  // saved edition, without changing the established paginated demo catalogs.
  if (group === "album" && collectionArtists[artistId]) {
    const saved = mockCollection.filter((album) => album.artists.some((item) => item.id === artistId));
    return [...saved.map((album): ArtistRelease => ({ ...album, album_type: "album", album_group: "album", artworkSource: "demo" })), ...releases];
  }
  return releases;
}
