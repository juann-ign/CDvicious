"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CollectionChapter } from "@/components/crate/CollectionChapter";
import { CrateChapter } from "@/components/crate/CrateChapter";
import { MixtapeChapter } from "@/components/crate/MixtapeChapter";
import { DeckPinnedLayer } from "./DeckPinnedLayer";
import { RailProvider } from "./RailContext";
import styles from "./HorizontalRail.module.css";

const DESKTOP_QUERY = "(min-width: 761px)";

const PANELS = [
  { number: "01", title: "Deck limpio", detail: "Rail base" },
  { number: "02", title: "Split / Booklet", detail: "Placeholder" },
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
    <RailProvider overlay={<DeckPinnedLayer />}>
      {PANELS.map((panel) => (
        <section
          key={panel.number}
          className={styles.panel}
          aria-label={panel.title}
        >
          <div className={styles.panelIndex}>{panel.number}</div>
          <div>
            <p className={styles.eyebrow}>CDvicious / EPIC A</p>
            <h1>{panel.title}</h1>
            <p className={styles.detail}>{panel.detail}</p>
          </div>
        </section>
      ))}

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="La Batea"
      >
        <div className={styles.panelIndex}>03</div>
        <div className={styles.chapterContent}>
          <CrateChapter />
        </div>
      </section>

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="La Colección"
      >
        <div className={styles.panelIndex}>04</div>
        <div className={styles.chapterContent}>
          <CollectionChapter />
        </div>
      </section>

      <section
        className={styles.panel + " " + styles.panelChapter}
        aria-label="Mixtape Lab"
      >
        <div className={styles.panelIndex}>05</div>
        <div className={styles.chapterContent}>
          <MixtapeChapter />
        </div>
      </section>
    </RailProvider>
  );
}
