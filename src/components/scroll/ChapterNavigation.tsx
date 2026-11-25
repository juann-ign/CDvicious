"use client";

import { useRailActions, useRailNavigation } from "./RailContext";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { UserProfileChip } from "@/components/UserProfileChip";
import { useAlbumDetailActions } from "@/components/crate/AlbumDetailNavigation";
import { useCatalogNavigation } from "@/components/crate/CatalogNavigation";
import { NavCatalogSearch } from "@/components/NavCatalogSearch";
import styles from "./ChapterNavigation.module.css";

const CHAPTERS = [
  { label: "Deck", shortLabel: "DECK" },
  { label: "Split", shortLabel: "SPLIT" },
  { label: "Batea", shortLabel: "BATEA" },
  { label: "Colección", shortLabel: "COLECCIÓN" },
  { label: "Mixtape Lab", shortLabel: "MIXTAPE" },
];

export function ChapterNavigation() {
  const { activeChapterIndex } = useRailNavigation();
  const { scrollToChapter } = useRailActions();
  const { closeAlbum } = useAlbumDetailActions();
  const catalog = useCatalogNavigation();
  const { isReady } = useSpotifyPlayer();
  const navigate = (index: number) => {
    if (closeAlbum(false)) requestAnimationFrame(() => scrollToChapter(index));
    else scrollToChapter(index);
  };

  return (
    <header className={styles.shellHeader} data-shell-header>
      <div className={styles.leading}>
        <div className={styles.brand}>CD<span>vicious</span></div>
        <NavCatalogSearch query={catalog.query} search={catalog.search} authenticated={catalog.authenticated}
          onQueryChange={catalog.changeQuery}
          onSubmit={() => { catalog.showGrid(); navigate(3); }}
          onSelectAlbum={(album) => { catalog.selectAlbum(album); navigate(3); }}
          onSelectArtist={(artist) => { catalog.selectArtist(artist); navigate(3); }} />
      </div>
      <nav className={styles.navigation} aria-label="Navegación por capítulos" data-hardware-front="navigation">
        {CHAPTERS.map((chapter, index) => {
          const active = index === activeChapterIndex;

          return (
            <button
              key={chapter.label}
              className={styles.chapter}
              type="button"
              aria-label={`Ir al capítulo ${chapter.label}`}
              aria-current={active ? "location" : undefined}
              onClick={() => {
                if (index === 3 && active && catalog.view.kind === "artist") catalog.changeQuery("");
                if (index !== 3 && catalog.view.kind === "album") catalog.finishOpeningAlbum(catalog.view.album.id);
                navigate(index);
              }}
            >
              <span
                className={styles.indicator}
                data-active={active ? "true" : "false"}
                aria-hidden="true"
              />
              <span>{chapter.shortLabel}</span>
            </button>
          );
        })}
      </nav>
      <div className={styles.trailing}>
        {catalog.authenticated === true && (
          <div className={styles.connection} data-ready={isReady} role="status"
            aria-label={`Reproductor web ${isReady ? "listo" : "sin conectar"}`}
            title={`Reproductor web ${isReady ? "listo" : "sin conectar"}`}>
            <svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M4 12v-1a7 7 0 0 1 14 0v1M4 12h3v6H5a1 1 0 0 1-1-1zm14 0h-3v6h2a1 1 0 0 0 1-1z" />
            </svg>
            <span aria-hidden="true">{isReady ? "Salida web lista" : "Salida sin conexión"}</span>
            <i aria-hidden="true" />
          </div>
        )}
        <div className={styles.profile}><UserProfileChip /></div>
      </div>
    </header>
  );
}
