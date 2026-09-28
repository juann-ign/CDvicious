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
  splitProgress: number;
  hideDeckProgress: number;
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [splitProgress, setSplitProgress] = useState(0);
  const [hideDeckProgress, setHideDeckProgress] = useState(0);

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

      const nextSplitProgress = Math.min(
        1,
        Math.max(0, (scroll - splitStart) / splitDistance),
      );
      const nextHideDeckProgress = Math.min(
        1,
        Math.max(0, (scroll - hideStart) / hideDistance),
      );

      setSplitProgress(nextSplitProgress);
      setHideDeckProgress(nextHideDeckProgress);
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
      setSplitProgress(0);
      setHideDeckProgress(0);

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
    splitProgress,
    hideDeckProgress,
    start,
    stop,
    scrollToX,
    scrollToChapter,
  };

  return (
    <RailContext.Provider value={value}>
      <div ref={wrapperRef} className={styles.wrapper} aria-label="Horizontal rail">
        <div ref={contentRef} className={styles.content}>
          {children}
        </div>
      </div>
      {overlay}
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
