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

const SNAP_IDLE_DELAY_MS = 140;
const SNAP_THRESHOLD_RATIO = 0.2;
const SNAP_MIN_DURATION_SECONDS = 0.16;
const SNAP_MAX_DURATION_SECONDS = 0.48;
const CHAPTER_FORWARD_THRESHOLD = 0.55;
const CHAPTER_BACKWARD_THRESHOLD = 0.45;

type RailLockToken = symbol;

type RailContextValue = {
  isReady: boolean;
  start: (token: RailLockToken) => void;
  stop: (token: RailLockToken) => void;
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
  const stopTokensRef = useRef(new Set<RailLockToken>());
  const animationFrameRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const snapInProgressRef = useRef(false);
  const activeChapterIndexRef = useRef<number | null>(null);
  const snapAnchorRef = useRef<{
    index: number;
    scroll: number;
  } | null>(null);
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

    activeChapterIndexRef.current = null;

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
      lerp: reducedMotionRef.current ? 1 : 0.09,
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
    if (stopTokensRef.current.size > 0) {
      lenis.stop();
    }
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

    const getNearestChapterIndex = (scroll: number) => {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      Array.from(content.children).forEach((child, index) => {
        const distance = Math.abs(
          (child as HTMLElement).offsetLeft - scroll,
        );

        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      return nearestIndex;
    };

    const clearSnapTimer = () => {
      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    };

    const snapToAnchor = () => {
      snapTimerRef.current = null;

      const activeLenis = lenisRef.current;
      const anchor = snapAnchorRef.current;

      if (
        !activeLenis ||
        !anchor ||
        activeLenis.isStopped ||
        stopTokensRef.current.size > 0 ||
        snapInProgressRef.current ||
        document.documentElement.dataset.modalOpen === "true"
      ) {
        snapAnchorRef.current = null;
        return;
      }

      const viewportWidth = Math.max(
        1,
        wrapper.clientWidth || window.innerWidth,
      );
      const threshold = viewportWidth * SNAP_THRESHOLD_RATIO;
      const delta = activeLenis.scroll - anchor.scroll;
      const lastChapterIndex = content.children.length - 1;

      let targetIndex = anchor.index;

      if (delta >= threshold) {
        targetIndex += 1;
      } else if (delta <= -threshold) {
        targetIndex -= 1;
      }

      targetIndex = Math.min(
        lastChapterIndex,
        Math.max(0, targetIndex),
      );

      const targetChapter = content.children[targetIndex] as
        | HTMLElement
        | undefined;

      if (!targetChapter) {
        snapAnchorRef.current = null;
        return;
      }

      const target = targetChapter.offsetLeft;
      const currentScrollX = activeLenis.scroll;
      const dist = Math.abs(target - currentScrollX);
      snapAnchorRef.current = null;

      if (dist < 6) {
        return;
      }

      const vw = Math.max(1, window.innerWidth);
      const dist01 = Math.min(1, dist / vw);
      const duration = Math.max(
        SNAP_MIN_DURATION_SECONDS,
        Math.min(
          SNAP_MAX_DURATION_SECONDS,
          0.18 + dist01 * 0.28,
        ),
      );

      snapInProgressRef.current = true;
      activeLenis.scrollTo(target, {
        duration: reducedMotionRef.current ? 0 : duration,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        userData: { source: "chapter-snap" },
        onComplete: () => {
          snapInProgressRef.current = false;
        },
      });
    };

    const armSnapTimer = (scroll: number) => {
      if (
        snapInProgressRef.current ||
        lenis.isStopped ||
        stopTokensRef.current.size > 0 ||
        document.documentElement.dataset.modalOpen === "true"
      ) {
        return;
      }

      if (!snapAnchorRef.current) {
        snapAnchorRef.current = {
          index: getNearestChapterIndex(scroll),
          scroll,
        };
      }

      clearSnapTimer();
      snapTimerRef.current = window.setTimeout(
        snapToAnchor,
        SNAP_IDLE_DELAY_MS,
      );
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
      const chapterPosition = scroll / viewportWidth;
      let activeChapterIndex = activeChapterIndexRef.current;

      if (activeChapterIndex === null) {
        activeChapterIndex = Math.min(
          maxChapterIndex,
          Math.max(0, Math.floor(chapterPosition)),
        );
      }

      while (
        activeChapterIndex < maxChapterIndex &&
        chapterPosition >= activeChapterIndex + CHAPTER_FORWARD_THRESHOLD
      ) {
        activeChapterIndex += 1;
      }

      while (
        activeChapterIndex > 0 &&
        chapterPosition <=
          activeChapterIndex - 1 + CHAPTER_BACKWARD_THRESHOLD
      ) {
        activeChapterIndex -= 1;
      }

      activeChapterIndexRef.current = activeChapterIndex;

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

      if (snapInProgressRef.current) {
        return;
      }

      armSnapTimer(scroll);
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
      clearSnapTimer();
      snapAnchorRef.current = null;
      snapInProgressRef.current = false;
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

  const start = useCallback((token: RailLockToken) => {
    const releasedLock = stopTokensRef.current.delete(token);

    if (!releasedLock || stopTokensRef.current.size > 0) {
      return;
    }

    lenisRef.current?.start();
  }, []);

  const stop = useCallback((token: RailLockToken) => {
    stopTokensRef.current.add(token);

    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }

    snapAnchorRef.current = null;
    snapInProgressRef.current = false;
    lenisRef.current?.stop();
  }, []);

  const scrollToX = useCallback((px: number) => {
    const lenis = lenisRef.current;

    if (!lenis || lenis.isStopped || stopTokensRef.current.size > 0) {
      return;
    }

    snapInProgressRef.current = true;
    lenis.scrollTo(Math.max(0, px), {
      onComplete: () => {
        snapInProgressRef.current = false;
      },
    });
  }, []);

  const scrollToChapter = useCallback((index: number, duration = 0.9) => {
    const lenis = lenisRef.current;
    const content = contentRef.current;

    if (
      !lenis ||
      !content ||
      content.children.length === 0 ||
      lenis.isStopped ||
      stopTokensRef.current.size > 0
    ) {
      return;
    }

    const safeIndex = Math.min(
      Math.max(0, Math.floor(index)),
      content.children.length - 1,
    );
    const chapter = content.children[safeIndex] as HTMLElement;

    snapInProgressRef.current = true;
    snapAnchorRef.current = null;
    lenis.scrollTo(chapter.offsetLeft, {
      duration: reducedMotionRef.current ? 0 : Math.max(0, duration),
      onComplete: () => {
        snapInProgressRef.current = false;
      },
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
          data-rail-wrapper
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
