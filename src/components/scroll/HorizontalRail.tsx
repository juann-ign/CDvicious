"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CollectionChapter } from "@/components/crate/CollectionChapter";
import { CrateChapter } from "@/components/crate/CrateChapter";
import { MixtapeChapter } from "@/components/crate/MixtapeChapter";
import { ChapterNavigation } from "./ChapterNavigation";
import { DeckPinnedLayer } from "./DeckPinnedLayer";
import { RailProvider } from "./RailContext";
import styles from "./HorizontalRail.module.css";

const DESKTOP_QUERY = "(min-width: 761px)";

const PANELS = [
  { id: "deck", label: "Deck" },
  { id: "split", label: "Split / Booklet" },
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);

    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

export function HorizontalRail({ fallback }: { fallback: ReactNode }) {
  const isDesktop = useIsDesktop();

  if (!isDesktop) {
    return <>{fallback}</>;
  }

  return (
    <RailProvider
      overlay={<DeckPinnedLayer />}
      navigation={<ChapterNavigation />}
    >
      {PANELS.map((panel) => (
        <section
          key={panel.id}
          className={styles.panel}
          aria-label={panel.label}
        >
        </section>
      ))}

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="La Batea"
      >
        <div className={styles.chapterContent}>
          <CrateChapter />
        </div>
      </section>

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="La Colección"
      >
        <div className={styles.chapterContent}>
          <CollectionChapter />
        </div>
      </section>

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="Mixtape Lab"
      >
        <div className={styles.chapterContent}>
          <MixtapeChapter />
        </div>
      </section>
    </RailProvider>
  );
}
