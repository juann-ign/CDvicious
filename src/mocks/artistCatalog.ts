import type { ArtistItem, ArtistRelease, ReleaseGroup } from "@/types/artist";

export const mockArtists: ArtistItem[] = [
  { id: "demo-vertice", name: "Vértice Magnético", images: [], genres: ["electrónica", "experimental"] },
  { id: "demo-satelite", name: "Satélite Sur", images: [], genres: ["ambient", "synth pop"] },
  { id: "demo-beatles", name: "The Beatles", images: [], genres: ["rock"] },
  { id: "demo-empty", name: "Archivo sin editar", images: [], genres: [] },
];
const titles = ["Campo magnético", "Frecuencia cero", "Órbita interior", "Luz residual", "Memoria de plata", "Ruido blanco", "Lado nocturno", "Circuitos", "Otra frecuencia", "Transmisión", "Señal abierta", "Última órbita"];
export function mockArtistReleases(artistId: string, group: ReleaseGroup): ArtistRelease[] {
  const artist = mockArtists.find((item) => item.id === artistId);
  if (!artist || artist.id === "demo-empty") return [];
  const count = group === "album" ? 27 : group === "single" ? 13 : 3;
  return Array.from({ length: count }, (_, index) => ({
    id: `${artistId}-${group}-${index}`,
    name: `${titles[index % titles.length]}${index >= titles.length ? ` / ${Math.floor(index / titles.length) + 1}` : ""}`,
    uri: `spotify:album:${artistId}-${group}-${index}`,
    artists: [{ id: artist.id, name: artist.name }],
    release_date: `${1994 + index}-04-12`, release_date_precision: "day",
    album_type: group, album_group: group,
    images: index === 8 ? [] : [{ url: `/images/discography/demo-${index % 3}.png`, width: 800, height: 800 }],
    artworkSource: "demo", label: "CDvicious · catálogo ficticio de prueba",
  }));
}
