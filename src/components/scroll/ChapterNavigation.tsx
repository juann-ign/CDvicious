"use client";

import { useRailActions, useRailNavigation } from "./RailContext";
import { UserProfileChip } from "@/components/UserProfileChip";
import { useAlbumDetailActions } from "@/components/crate/AlbumDetailNavigation";
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

  return (
    <header className={styles.shellHeader} data-shell-header>
      <div className={styles.brand}>CD<span>vicious</span></div>
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
                if (closeAlbum(false)) requestAnimationFrame(() => scrollToChapter(index));
                else scrollToChapter(index);
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
      <div className={styles.profile}><UserProfileChip /></div>
    </header>
  );
}
