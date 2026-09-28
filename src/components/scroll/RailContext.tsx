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
};

export const RailContext = createContext<RailContextValue | null>(null);

export function RailProvider({ children }: RailProviderProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [isReady, setIsReady] = useState(false);

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

      lenis.destroy();
      lenisRef.current = null;
      setIsReady(false);

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
      <div ref={wrapperRef} className={styles.wrapper} aria-label="Horizontal rail">
        <div ref={contentRef} className={styles.content}>
          {children}
        </div>
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
