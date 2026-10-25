"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import styles from "./RailProvider.module.css";

const SNAP_IDLE_DELAY_MS = 120;
const RAIL_IDLE_DELAY_MS = 250;
const SNAP_THRESHOLD_RATIO = 0.2;
const SNAP_MIN_DURATION_SECONDS = 0.62;
const SNAP_MAX_DURATION_SECONDS = 0.92;
const CHAPTER_FORWARD_THRESHOLD = 0.55;
const CHAPTER_BACKWARD_THRESHOLD = 0.45;

type RailLockToken = symbol;

type RailActionsContextValue = {
  isReady: boolean;
  start: (token: RailLockToken) => void;
  stop: (token: RailLockToken) => void;
  scrollToX: (px: number) => void;
  scrollToChapter: (index: number, duration?: number) => void;
};

type RailNavigationContextValue = {
  activeChapterIndex: number;
};

type RailContextValue = RailActionsContextValue & RailNavigationContextValue;

type RailProviderProps = {
  children: ReactNode;
  overlay?: ReactNode;
  navigation?: ReactNode;
};

export const RailContext = createContext<RailActionsContextValue | null>(null);
export const RailNavigationContext =
  createContext<RailNavigationContextValue | null>(null);

export function RailProvider({ children, overlay, navigation }: RailProviderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const stopTokensRef = useRef(new Set<RailLockToken>());
  const animationFrameRef = useRef<number | null>(null);
  const railIdleTimerRef = useRef<number | null>(null);
  const markRailMovingRef = useRef<(() => void) | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const snapInProgressRef = useRef(false);
  const snapTargetIndexRef = useRef<number | null>(null);
  const snapSequenceRef = useRef(0);
  const programmaticSourceRef = useRef<"menu" | "wheel" | null>(null);
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

    activeChapterIndexRef.current = null;
    root.dataset.railMoving = "false";

    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;

    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

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

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const scheduleRailIdleCheck = () => {
      railIdleTimerRef.current = window.setTimeout(() => {
        railIdleTimerRef.current = null;
        const activeLenis = lenisRef.current;

        // A long frame or a busy main thread must not falsely signal that the
        // rail settled while Lenis is still moving toward its destination.
        if (activeLenis?.isScrolling || snapInProgressRef.current) {
          scheduleRailIdleCheck();
          return;
        }

        if (root.dataset.railMoving !== "false") {
          root.dataset.railMoving = "false";
        }
      }, RAIL_IDLE_DELAY_MS);
    };

    const markRailMoving = () => {
      if (railIdleTimerRef.current !== null) {
        window.clearTimeout(railIdleTimerRef.current);
        railIdleTimerRef.current = null;
      }
      if (root.dataset.railMoving !== "true") {
        root.dataset.railMoving = "true";
      }
      scheduleRailIdleCheck();
    };
    markRailMovingRef.current = markRailMoving;


    let scheduleWheelSnap: (() => void) | null = null;

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
          const activeLenis = lenisRef.current;
          const hasWheelDelta = data.deltaX !== 0 || data.deltaY !== 0;
          const canHandleWheel =
            hasWheelDelta &&
            activeLenis &&
            !activeLenis.isStopped &&
            stopTokensRef.current.size === 0 &&
            document.documentElement.dataset.modalOpen !== "true";

          if (canHandleWheel && activeLenis) {
            markRailMoving();
            const interruptedSource = programmaticSourceRef.current;
            // A new user gesture can interrupt Lenis's programmatic snap. Its
            // old onComplete callback will not necessarily run, so release the
            // snap latch and invalidate that callback before accepting input.
            const interruptedSnap = snapInProgressRef.current;
            const interruptedTargetIndex = interruptedSnap
              ? snapTargetIndexRef.current
              : null;

            if (interruptedSnap) {
              snapSequenceRef.current += 1;
              snapInProgressRef.current = false;
              snapTargetIndexRef.current = null;
            }

            // Capture the gesture origin before Lenis applies this wheel delta.
            // Lenis accumulates wheel input against targetScroll, so when a
            // programmatic snap is interrupted, use that intended destination
            // as the baseline rather than the animation's in-between position.
            if (!snapAnchorRef.current) {
              const anchorScroll = interruptedSnap
                ? activeLenis.targetScroll
                : activeLenis.scroll;
              snapAnchorRef.current = {
                // If a user interrupts a menu jump, anchor the next wheel
                // gesture to the chapter nearest the actual current position,
                // not the abandoned far-away destination.
                index:
                  interruptedSource === "menu"
                    ? getNearestChapterIndex(anchorScroll)
                    : interruptedTargetIndex ??
                      getNearestChapterIndex(anchorScroll),
                scroll: anchorScroll,
              };
            }

            // Schedule from the wheel gesture itself, not the RAF-driven scroll
            // stream; otherwise the chapter decision can feel late after input ends.
            scheduleWheelSnap?.();
          }

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
      // Lenis eases `scroll` toward `targetScroll`; decide the snap from the
      // destination requested by the complete wheel gesture, not an intermediate
      // animation frame that can still be below the chapter threshold.
      const delta = activeLenis.targetScroll - anchor.scroll;
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
          0.62 + dist01 * 0.3,
        ),
      );

      const snapSequence = ++snapSequenceRef.current;
      snapTargetIndexRef.current = targetIndex;
      snapInProgressRef.current = true;
      programmaticSourceRef.current = "wheel";
      activeLenis.scrollTo(target, {
        lerp: reducedMotionRef.current ? 1 : 0.16,
        userData: { source: "chapter-snap" },
        onComplete: () => {
          if (snapSequenceRef.current !== snapSequence) return;
          snapInProgressRef.current = false;
          snapTargetIndexRef.current = null;
          programmaticSourceRef.current = null;
        },
      });
    };

    scheduleWheelSnap = () => {
      const activeLenis = lenisRef.current;

      if (
        !activeLenis ||
        activeLenis.isStopped ||
        stopTokensRef.current.size > 0 ||
        document.documentElement.dataset.modalOpen === "true"
      ) {
        return;
      }

      if (!snapAnchorRef.current) {
        const anchorScroll = activeLenis.scroll;
        snapAnchorRef.current = {
          index: getNearestChapterIndex(anchorScroll),
          scroll: anchorScroll,
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
      setActiveChapterIndex((current) =>
        current === activeChapterIndex ? current : activeChapterIndex,
      );

      root.style.setProperty("--pSplit", String(splitProgress));
      root.style.setProperty("--pHideDeck", String(hideDeckProgress));

      // These attributes are observed by chapters, the Deck and the marquee.
      // Assigning the same value on every Lenis frame still queues mutation
      // records, so only publish discrete state changes.
      const splitActive = splitProgress > 0.05 ? "true" : "false";
      const deckHidden = hideDeckProgress >= 0.98 ? "true" : "false";
      const chapter = String(activeChapterIndex);
      const deckInteractive = activeChapterIndex < 2 ? "true" : "false";

      if (root.dataset.splitActive !== splitActive) {
        root.dataset.splitActive = splitActive;
      }
      if (root.dataset.deckHidden !== deckHidden) {
        root.dataset.deckHidden = deckHidden;
      }
      if (root.dataset.chapter !== chapter) {
        root.dataset.chapter = chapter;
      }
      if (root.dataset.deckInteractive !== deckInteractive) {
        root.dataset.deckInteractive = deckInteractive;
      }
      if (document.documentElement.dataset.chapter !== chapter) {
        document.documentElement.dataset.chapter = chapter;
      }

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
      markRailMoving();
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
      programmaticSourceRef.current = null;
      markRailMovingRef.current = null;
      if (railIdleTimerRef.current !== null) {
        window.clearTimeout(railIdleTimerRef.current);
        railIdleTimerRef.current = null;
      }
      delete root.dataset.railMoving;
      resizeObserver.disconnect();
      clearSnapTimer();
      scheduleWheelSnap = null;
      snapSequenceRef.current += 1;
      snapTargetIndexRef.current = null;
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
    programmaticSourceRef.current = null;
    stopTokensRef.current.add(token);

    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }

    snapSequenceRef.current += 1;
    snapTargetIndexRef.current = null;
    snapAnchorRef.current = null;
    snapInProgressRef.current = false;
    lenisRef.current?.stop();
  }, []);

  const scrollToX = useCallback((px: number) => {
    programmaticSourceRef.current = null;
    const lenis = lenisRef.current;

    if (!lenis || lenis.isStopped || stopTokensRef.current.size > 0) {
      return;
    }

    const snapSequence = ++snapSequenceRef.current;
    snapTargetIndexRef.current = null;
    snapInProgressRef.current = true;
    if (!reducedMotionRef.current) markRailMovingRef.current?.();
    lenis.scrollTo(Math.max(0, px), {
      onComplete: () => {
        if (snapSequenceRef.current !== snapSequence) return;
        snapInProgressRef.current = false;
        snapTargetIndexRef.current = null;
      },
    });
  }, []);

  const scrollToChapter = useCallback((index: number, duration?: number) => {
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

    programmaticSourceRef.current = null;
    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
    snapAnchorRef.current = null;

    const safeIndex = Math.min(
      Math.max(0, Math.floor(index)),
      content.children.length - 1,
    );
    const chapter = content.children[safeIndex] as HTMLElement;
    const distance = Math.abs(chapter.offsetLeft - lenis.scroll);
    if (distance < 2 && !snapInProgressRef.current) {
      return;
    }

    const viewportWidth = Math.max(
      1,
      wrapperRef.current?.clientWidth || window.innerWidth,
    );
    const chapterDistance = distance / viewportWidth;
    const resolvedDuration =
      duration ??
      Math.min(3.25, Math.max(0.72, chapterDistance * 0.78));

    if (!reducedMotionRef.current) markRailMovingRef.current?.();
    const snapSequence = ++snapSequenceRef.current;
    snapTargetIndexRef.current = safeIndex;
    snapInProgressRef.current = true;
    snapAnchorRef.current = null;

    const onComplete = () => {
      if (snapSequenceRef.current !== snapSequence) return;
      snapInProgressRef.current = false;
      snapTargetIndexRef.current = null;
      programmaticSourceRef.current = null;
    };

    if ((duration !== undefined && duration <= 0) || reducedMotionRef.current) {
      lenis.scrollTo(chapter.offsetLeft, {
        immediate: true,
        force: true,
        onComplete,
      });
      return;
    }

    programmaticSourceRef.current = "menu";
    // Use exactly one Lenis animation mode. Explicitly timed movements (the
    // flying disc handoff) stay duration-based; chapter-menu jumps use native
    // time-based lerping to keep the first frame bounded and interruptible.
    if (duration !== undefined) {
      lenis.scrollTo(chapter.offsetLeft, {
        duration: resolvedDuration,
        easing: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
        onComplete,
      });
    } else {
      const lerp = chapterDistance >= 2 ? 0.055 : 0.16;
      lenis.scrollTo(chapter.offsetLeft, {
        lerp,
        onComplete,
      });
    }
  }, []);
  const actionsValue = useMemo<RailActionsContextValue>(
    () => ({ isReady, start, stop, scrollToX, scrollToChapter }),
    [isReady, start, stop, scrollToX, scrollToChapter],
  );
  const navigationValue = useMemo<RailNavigationContextValue>(
    () => ({ activeChapterIndex }),
    [activeChapterIndex],
  );

  return (
    <RailContext.Provider value={actionsValue}>
      <RailNavigationContext.Provider value={navigationValue}>
        <div
          ref={rootRef}
          className={styles.root}
          data-rail-ready={isReady ? "true" : "false"}
        >
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
      </RailNavigationContext.Provider>
    </RailContext.Provider>
  );
}

export function useRailActions(): RailActionsContextValue {
  const context = useContext(RailContext);
  if (!context) throw new Error("useRailActions must be used inside a RailProvider");
  return context;
}

export function useRailNavigation(): RailNavigationContextValue {
  const context = useContext(RailNavigationContext);
  if (!context) throw new Error("useRailNavigation must be used inside a RailProvider");
  return context;
}

export function useRail(): RailContextValue {
  return { ...useRailActions(), ...useRailNavigation() };
}
