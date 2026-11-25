"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useCatalogSearch } from "@/hooks/useCatalogSearch";
import type { ArtistItem } from "@/types/artist";
import type { AlbumItem } from "@/types/crate";

type CatalogView =
  | { kind: "grid" }
  | { kind: "artist"; artist: ArtistItem }
  | { kind: "album"; album: AlbumItem; openOnArrival: boolean };

interface CatalogNavigationState {
  query: string;
  view: CatalogView;
  authenticated: boolean | null;
  search: ReturnType<typeof useCatalogSearch>;
  changeQuery(query: string): void;
  showGrid(): void;
  selectArtist(artist: ArtistItem): void;
  selectAlbum(album: AlbumItem): void;
  finishOpeningAlbum(id: string): void;
}

const GRID: CatalogView = { kind: "grid" };
const CatalogContext = createContext<CatalogNavigationState | null>(null);

export function CatalogNavigation({ children }: { children: ReactNode }) {
  const { authenticated } = useSpotifyPlayer();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CatalogView>(GRID);
  const search = useCatalogSearch(query, authenticated === true);

  const changeQuery = useCallback((text: string) => {
    setQuery(text);
    setView(GRID);
  }, []);

  useEffect(() => {
    if (authenticated === false) changeQuery("");
  }, [authenticated, changeQuery]);

  const finishOpeningAlbum = useCallback((id: string) => {
    setView((current) => current.kind === "album" && current.openOnArrival && current.album.id === id
      ? { ...current, openOnArrival: false } : current);
  }, []);

  return <CatalogContext.Provider value={{
    query, view, authenticated, search, changeQuery, finishOpeningAlbum,
    showGrid: () => setView(GRID),
    selectArtist: (artist) => setView({ kind: "artist", artist }),
    selectAlbum: (album) => setView({ kind: "album", album, openOnArrival: true }),
  }}>{children}</CatalogContext.Provider>;
}

export function useCatalogNavigation() {
  const state = useContext(CatalogContext);
  if (!state) throw new Error("Catalog navigation requires its provider");
  return state;
}
