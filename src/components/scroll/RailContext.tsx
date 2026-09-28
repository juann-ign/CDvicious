"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import styles from "./RailProvider.module.css";

type RailContextValue = {
  isReady: boolean;
  start: () => void;
  stop: () => void;
  scrollToX: (px: number) => void;
  scrollToChapter: (index: number) => void;
};

type RailProviderProps = {
  children: ReactNode;
  overlay?: ReactNode;
};

export const RailContext = createContext<RailContextValue | null>(null);

export function RailProvider({ children, overlay }: RailProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;

    if (!root || !wrapper || !content) {
      return;
    }

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: root,
      orientation: "horizontal",
      gestureOrientation: "horizontal",
      smoothWheel: true,
      lerp: 0.075,
      wheelMultiplier: 0.85,
      virtualScroll: (data) => {
        if (data.event.type === "wheel") {
          if (Math.abs(data.deltaY) >= Math.abs(data.deltaX)) {
            data.deltaX = data.deltaY;
            data.deltaY = 0;
          }
        }

        return true;
      },
      autoRaf: false,
    });

    lenisRef.current = lenis;
    setIsReady(true);

    const updateRailProgress = (scroll: number) => {
      const chapters = Array.from(content.children) as HTMLElement[];
      const firstChapter = chapters[0];
      const secondChapter = chapters[1];
      const thirdChapter = chapters[2];

      const splitStart = firstChapter?.offsetLeft ?? 0;
      const splitEnd =
        secondChapter?.offsetLeft ??
        splitStart + (firstChapter?.offsetWidth || wrapper.clientWidth);

      const hideStart = secondChapter?.offsetLeft ?? splitEnd;
      const hideEnd =
        thirdChapter?.offsetLeft ??
        hideStart + (secondChapter?.offsetWidth || wrapper.clientWidth);

      const splitDistance = Math.max(1, splitEnd - splitStart);
      const hideDistance = Math.max(1, hideEnd - hideStart);

      const splitProgress = Math.min(
        1,
        Math.max(0, (scroll - splitStart) / splitDistance),
      );
      const hideDeckProgress = Math.min(
        1,
        Math.max(0, (scroll - hideStart) / hideDistance),
      );

      root.style.setProperty("--pSplit", String(splitProgress));
      root.style.setProperty("--pHideDeck", String(hideDeckProgress));
      root.dataset.splitActive = splitProgress > 0.05 ? "true" : "false";
      root.dataset.deckHidden = hideDeckProgress >= 0.98 ? "true" : "false";
    };

    updateRailProgress(lenis.scroll);

    const handleScroll = ({ scroll }: { scroll: number }) => {
      updateRailProgress(scroll);
    };

    lenis.on("scroll", handleScroll);

    const raf = (time: number) => {
      lenis.raf(time);
      animationFrameRef.current = window.requestAnimationFrame(raf);
    };

    animationFrameRef.current = window.requestAnimationFrame(raf);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      lenis.off("scroll", handleScroll);
      lenis.destroy();
      lenisRef.current = null;
      setIsReady(false);

      root.style.removeProperty("--pSplit");
      root.style.removeProperty("--pHideDeck");
      delete root.dataset.splitActive;
      delete root.dataset.deckHidden;

      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const start = useCallback(() => {
    lenisRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    lenisRef.current?.stop();
  }, []);

  const scrollToX = useCallback((px: number) => {
    const lenis = lenisRef.current;

    if (!lenis) {
      return;
    }

    lenis.scrollTo(Math.max(0, px));
  }, []);

  const scrollToChapter = useCallback((index: number) => {
    const lenis = lenisRef.current;
    const content = contentRef.current;

    if (!lenis || !content || content.children.length === 0) {
      return;
    }

    const safeIndex = Math.min(
      Math.max(0, Math.floor(index)),
      content.children.length - 1,
    );
    const chapter = content.children[safeIndex] as HTMLElement;

    lenis.scrollTo(chapter.offsetLeft);
  }, []);

  const value: RailContextValue = {
    isReady,
    start,
    stop,
    scrollToX,
    scrollToChapter,
  };

  return (
    <RailContext.Provider value={value}>
      <div ref={rootRef} className={styles.root}>
        <div
          ref={wrapperRef}
          className={styles.wrapper}
          aria-label="Horizontal rail"
        >
          <div ref={contentRef} className={styles.content}>
            {children}
          </div>
        </div>
        {overlay}
      </div>
    </RailContext.Provider>
  );
}

export function useRail(): RailContextValue {
  const context = useContext(RailContext);

  if (!context) {
    throw new Error("useRail must be used inside a RailProvider");
  }

  return context;
}
