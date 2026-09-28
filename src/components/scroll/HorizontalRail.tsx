"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Lenis from "lenis";
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

  return <HorizontalRailDesktop />;
}

function HorizontalRailDesktop() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const content = contentRef.current;

    if (!wrapper || !content) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const lenis = new Lenis({
      wrapper,
      content,
      orientation: "horizontal",
      gestureOrientation: "both",
      autoRaf: false,
      smoothWheel: true,
    });

    let animationFrame = 0;

    const raf = (time: number) => {
      lenis.raf(time);
      animationFrame = window.requestAnimationFrame(raf);
    };

    animationFrame = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      lenis.destroy();
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  return (
    <div ref={wrapperRef} className={styles.wrapper} aria-label="Horizontal rail">
      <div ref={contentRef} className={styles.content}>
        {PANELS.map((panel) => (
          <section key={panel.number} className={styles.panel} aria-label={panel.title}>
            <div className={styles.panelIndex}>{panel.number}</div>
            <div>
              <p className={styles.eyebrow}>CDvicious / EPIC A</p>
              <h1>{panel.title}</h1>
              <p className={styles.detail}>{panel.detail}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
