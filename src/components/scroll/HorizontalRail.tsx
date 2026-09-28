"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DeckPinnedLayer } from "./DeckPinnedLayer";
import { RailProvider } from "./RailContext";
import styles from "./HorizontalRail.module.css";

const DESKTOP_QUERY = "(min-width: 761px)";

const PANELS = [
  { number: "01", title: "Deck limpio", detail: "Rail base" },
  { number: "02", title: "Split / Booklet", detail: "Placeholder" },
  { number: "03", title: "La Batea", detail: "Placeholder" },
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
    <RailProvider>
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
      <DeckPinnedLayer />
    </RailProvider>
  );
}
