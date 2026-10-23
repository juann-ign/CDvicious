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
  activeChapterIndex: number;
  start: (token: RailLockToken) => void;
  stop: (token: RailLockToken) => void;
  scrollToX: (px: number) => void;
  scrollToChapter: (index: number, duration?: number) => void;
};

type RailProviderProps = {
  children: ReactNode;
  overlay?: ReactNode;
  navigation?: ReactNode;
};

export const RailContext = createContext<RailContextValue | null>(null);

export function RailProvider({ children, overlay, navigation }: RailProviderProps) {
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
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);

  useEffect(() => {
    const root = rootRef.current;
    const wrapper = wrapperRef.current;
    const content = contentRef.current;

    if (!root || !wrapper || !content) {
      return;
    }

    console.log(
      "[rail:debug:init]",
      JSON.stringify({
        railFlag: process.env.NEXT_PUBLIC_ENABLE_RAIL ?? null,
        viewportWidth: window.innerWidth,
        desktopBreakpointMatches: window.matchMedia("(min-width: 761px)").matches,
        rootConnected: root.isConnected,
        wrapperWidth: wrapper.clientWidth,
      }),
    );

    const handleDiagnosticWheel = (event: WheelEvent) => {
      const eventTarget = event.target;
      const targetElement =
        eventTarget instanceof Element
          ? eventTarget
          : eventTarget instanceof Node
            ? eventTarget.parentElement
            : null;

      console.log(
        "[rail:wheel:dom]",
        JSON.stringify({
          deltaX: event.deltaX,
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          targetTag: targetElement?.tagName ?? null,
          targetClass: targetElement?.getAttribute("class") ?? null,
          rootContainsTarget: eventTarget instanceof Node && root.contains(eventTarget),
          defaultPrevented: event.defaultPrevented,
          wrapperWidth: wrapper.clientWidth,
        }),
      );
    };

    root.addEventListener("wheel", handleDiagnosticWheel, {
      capture: true,
      passive: true,
    });

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
          const target = data.event.target;
          const targetElement =
            target instanceof Element
              ? target
              : target instanceof Node
                ? target.parentElement
                : null;

          console.log(
            "[rail:wheel:before-map]",
            JSON.stringify({
              eventDeltaX:
                data.event instanceof WheelEvent ? data.event.deltaX : null,
              eventDeltaY:
                data.event instanceof WheelEvent ? data.event.deltaY : null,
              lenisDeltaX: data.deltaX,
              lenisDeltaY: data.deltaY,
              targetTag: targetElement?.tagName ?? null,
              targetClass: targetElement?.getAttribute("class") ?? null,
              rootContainsTarget: target instanceof Node && root.contains(target),
              wrapperWidth: wrapper.clientWidth,
            }),
          );

          if (Math.abs(data.deltaY) >= Math.abs(data.deltaX)) {
            data.deltaX = data.deltaY;
            data.deltaY = 0;
          }

          console.log(
            "[rail:wheel:after-map]",
            JSON.stringify({
              deltaX: data.deltaX,
              deltaY: data.deltaY,
            }),
          );
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

      console.log(
        "[rail:snap:attempt]",
        JSON.stringify({
          scroll: activeLenis?.scroll ?? null,
          targetScroll: activeLenis?.targetScroll ?? null,
          anchor,
          isStopped: activeLenis?.isStopped ?? null,
          stopLockCount: stopTokensRef.current.size,
          snapInProgress: snapInProgressRef.current,
          modalOpen: document.documentElement.dataset.modalOpen === "true",
        }),
      );

      const skipReason = !activeLenis
        ? "missing-lenis"
        : !anchor
          ? "missing-anchor"
          : activeLenis.isStopped
            ? "lenis-stopped"
            : stopTokensRef.current.size > 0
              ? "stop-lock"
              : snapInProgressRef.current
                ? "snap-already-in-progress"
                : document.documentElement.dataset.modalOpen === "true"
                  ? "modal-open"
                  : null;

      if (skipReason) {
        console.log(
          "[rail:snap:skip]",
          JSON.stringify({ reason: skipReason, anchor }),
        );
        snapAnchorRef.current = null;
        return;
      }

      if (!activeLenis || !anchor) return;

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

      console.log(
        "[rail:snap:decision]",
        JSON.stringify({
          anchorIndex: anchor.index,
          anchorScroll: anchor.scroll,
          currentScrollX,
          currentTargetScroll: activeLenis.targetScroll,
          delta,
          threshold,
          targetIndex,
          target,
          dist,
          wrapperWidth: wrapper.clientWidth,
          currentChapter: root.dataset.chapter,
        }),
      );

      snapAnchorRef.current = null;

      if (dist < 6) {
        console.log(
          "[rail:snap:skip]",
          JSON.stringify({ reason: "already-at-target", dist }),
        );
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

      console.log(
        "[rail:snap:start]",
        JSON.stringify({
          targetIndex,
          target,
          from: activeLenis.scroll,
          duration: reducedMotionRef.current ? 0 : duration,
          reducedMotion: reducedMotionRef.current,
        }),
      );

      snapInProgressRef.current = true;
      activeLenis.scrollTo(target, {
        duration: reducedMotionRef.current ? 0 : duration,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        userData: { source: "chapter-snap" },
        onComplete: () => {
          snapInProgressRef.current = false;
          console.log(
            "[rail:snap:complete]",
            JSON.stringify({
              targetIndex,
              target,
              finalScroll: lenisRef.current?.scroll ?? null,
              chapter: root.dataset.chapter,
            }),
          );
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
        const anchorIndex = getNearestChapterIndex(scroll);
        snapAnchorRef.current = {
          index: anchorIndex,
          scroll,
        };

        console.log(
          "[rail:snap:anchor]",
          JSON.stringify({
            anchorIndex,
            anchorScroll: scroll,
            wrapperWidth: wrapper.clientWidth,
            threshold: wrapper.clientWidth * SNAP_THRESHOLD_RATIO,
          }),
        );
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
      setActiveChapterIndex((current) =>
        current === activeChapterIndex ? current : activeChapterIndex,
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

    let lastScrollDebugAt = 0;

    const handleScroll = ({ scroll }: { scroll: number }) => {
      if (process.env.NODE_ENV !== "production") {
        const now = performance.now();

        if (now - lastScrollDebugAt >= 150) {
          lastScrollDebugAt = now;

          console.log(
            "[rail:scroll]",
            JSON.stringify({
              scroll,
              targetScroll: lenis.targetScroll,
              velocity: lenis.velocity,
              chapter: root.dataset.chapter,
              snapInProgress: snapInProgressRef.current,
              anchor: snapAnchorRef.current,
            }),
          );
        }
      }

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
      root.removeEventListener("wheel", handleDiagnosticWheel, true);
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
    activeChapterIndex,
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
        {navigation}
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
