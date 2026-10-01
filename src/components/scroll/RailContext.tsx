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
  scrollToChapter: (index: number, duration?: number) => void;
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
  const reducedMotionRef = useRef(false);
  const chapterMetricsRef = useRef({
    splitStart: 0,
    splitDistance: 1,
    hideStart: 0,
    hideDistance: 1,
  });
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

    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const lenis = new Lenis({
      wrapper,
      content,
      eventsTarget: root,
      orientation: "horizontal",
      gestureOrientation: "horizontal",
      smoothWheel: !reducedMotionRef.current,
      lerp: reducedMotionRef.current ? 1 : 0.075,
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

    const measureRail = () => {
      const firstChapter = content.children[0] as HTMLElement | undefined;
      const secondChapter = content.children[1] as HTMLElement | undefined;
      const thirdChapter = content.children[2] as HTMLElement | undefined;

      const splitStart = firstChapter?.offsetLeft ?? 0;
      const splitEnd =
        secondChapter?.offsetLeft ??
        splitStart + (firstChapter?.offsetWidth || wrapper.clientWidth);

      const hideStart = secondChapter?.offsetLeft ?? splitEnd;
      const hideEnd =
        thirdChapter?.offsetLeft ??
        hideStart + (secondChapter?.offsetWidth || wrapper.clientWidth);

      chapterMetricsRef.current = {
        splitStart,
        splitDistance: Math.max(1, splitEnd - splitStart),
        hideStart,
        hideDistance: Math.max(1, hideEnd - hideStart),
      };
    };

    const updateRailProgress = (scroll: number) => {
      const { splitStart, splitDistance, hideStart, hideDistance } =
        chapterMetricsRef.current;

      const splitProgress = Math.min(
        1,
        Math.max(0, (scroll - splitStart) / splitDistance),
      );
      const hideDeckProgress = Math.min(
        1,
        Math.max(0, (scroll - hideStart) / hideDistance),
      );

      const viewportWidth = Math.max(
        1,
        wrapper.clientWidth || window.innerWidth,
      );
      const maxChapterIndex = Math.max(0, content.children.length - 1);
      const activeChapterIndex = Math.min(
        maxChapterIndex,
        Math.max(0, Math.round(scroll / viewportWidth)),
      );

      root.style.setProperty("--pSplit", String(splitProgress));
      root.style.setProperty("--pHideDeck", String(hideDeckProgress));
      root.dataset.splitActive = splitProgress > 0.05 ? "true" : "false";
      root.dataset.deckHidden = hideDeckProgress >= 0.98 ? "true" : "false";
      root.dataset.chapter = String(activeChapterIndex);
      root.dataset.deckInteractive = activeChapterIndex < 2 ? "true" : "false";
      document.documentElement.dataset.chapter = String(activeChapterIndex);

      Array.from(content.children).forEach((child, index) => {
        const panel = child as HTMLElement;
        const active = index === activeChapterIndex;

        panel.toggleAttribute("inert", !active);
        panel.dataset.chapterActive = active ? "true" : "false";
      });

      const overlay = root.querySelector<HTMLElement>("[data-rail-overlay]");
      overlay?.toggleAttribute("inert", activeChapterIndex >= 2);
    };

    measureRail();
    updateRailProgress(lenis.scroll);

    const resizeObserver = new ResizeObserver(() => {
      measureRail();
      updateRailProgress(lenis.scroll);
    });

    resizeObserver.observe(wrapper);
    resizeObserver.observe(content);

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
      resizeObserver.disconnect();
      lenis.destroy();
      lenisRef.current = null;
      setIsReady(false);

      root.style.removeProperty("--pSplit");
      root.style.removeProperty("--pHideDeck");
      delete root.dataset.splitActive;
      delete root.dataset.deckHidden;
      delete root.dataset.deckInteractive;
      delete root.dataset.chapter;
      delete document.documentElement.dataset.chapter;

      Array.from(content.children).forEach((child) => {
        const panel = child as HTMLElement;
        panel.toggleAttribute("inert", false);
        delete panel.dataset.chapterActive;
      });

      const overlay = root.querySelector<HTMLElement>("[data-rail-overlay]");
      overlay?.toggleAttribute("inert", false);

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

  const scrollToChapter = useCallback((index: number, duration = 0.9) => {
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

    lenis.scrollTo(chapter.offsetLeft, {
      duration: reducedMotionRef.current ? 0 : Math.max(0, duration),
    });
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
