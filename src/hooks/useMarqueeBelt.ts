"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

interface Options {
  speed?: number;
  enabled?: boolean;
  paused?: boolean;
  length: number;
  pages?: number;
  chapterIndex?: number;
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
}

const DRAG_THRESHOLD_PX = 6;

interface Gesture {
  id: number;
  lastX: number;
  captured: boolean;
}

interface ShelfPointerDragOptions {
  enabled: boolean;
  chapterIndex: number;
  lifecycleKey?: string;
  onPress?: () => void;
  onDelta: (distance: number) => void;
  onRelease?: () => void;
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
}

export function isMarqueeChapterActive(dataset: DOMStringMap | undefined, chapterIndex = 2) {
  return !dataset || (dataset.chapter === String(chapterIndex) && dataset.railMoving !== "true" && dataset.albumDetailOpen !== "true");
}

/** The shelf's gesture owns the pointer and rail lock; each shelf owns its offset. */
export function useShelfPointerDrag(containerRef: RefObject<HTMLDivElement | null>, options: ShelfPointerDragOptions) {
  const gesture = useRef<Gesture | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const latest = useRef(options);
  latest.current = options;
  const { enabled, chapterIndex, lifecycleKey } = options;

  useEffect(() => {
    const el = containerRef.current;
    if (!enabled || !el) return;
    const railRoot = document.querySelector<HTMLElement>("[data-rail-wrapper]")?.parentElement;
    const active = () => latest.current.enabled && !document.hidden && isMarqueeChapterActive(railRoot?.dataset, chapterIndex);
    // Acquiring the rail lock can set railMoving during Lenis's reset. It
    // must not cancel the gesture that owns that lock in the same chapter.
    const canContinue = (current: Gesture) => {
      if (!current.captured) return active();
      return latest.current.enabled && !document.hidden && (!railRoot || (railRoot.dataset.chapter === String(chapterIndex) && railRoot.dataset.albumDetailOpen !== "true"));
    };

    let suppressNextClick = false;
    let suppressClickTimer: number | null = null;

    const clearClickSuppression = () => {
      suppressNextClick = false;
      if (suppressClickTimer !== null) {
        window.clearTimeout(suppressClickTimer);
        suppressClickTimer = null;
      }
    };

    const down = (event: PointerEvent) => {
      if (!active() || event.button !== 0 || !event.isPrimary || gesture.current) return;
      clearClickSuppression();
      gesture.current = { id: event.pointerId, lastX: event.clientX, captured: false };
      latest.current.onPress?.();
    };

    const finish = (cancelled: boolean) => {
      const current = gesture.current;
      if (!current) return;
      gesture.current = null;
      setIsDragging(false);

      if (current.captured) {
        clearClickSuppression();
        // Pointerup may be followed by click. A cancelled gesture may also
        // receive a late click, but an intentional next press clears the guard.
        suppressNextClick = true;
        suppressClickTimer = window.setTimeout(clearClickSuppression, cancelled ? 500 : 0);
        latest.current.onGrabEnd?.();
        if (el.hasPointerCapture?.(current.id)) el.releasePointerCapture(current.id);
      }
      latest.current.onRelease?.();
    };

    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!canContinue(current) || event.buttons === 0) {
        finish(true);
        return;
      }
      const dx = event.clientX - current.lastX;

      if (!current.captured) {
        if (Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
        try {
          el.setPointerCapture?.(current.id);
        } catch {
          finish(true);
          return;
        }
        current.captured = true;
        setIsDragging(true);
        latest.current.onGrabStart?.();
      }

      if (gesture.current !== current) return;
      current.lastX = event.clientX;
      latest.current.onDelta(dx);
    };

    const click = (event: MouseEvent) => {
      if (!suppressNextClick || event.detail === 0) return;
      clearClickSuppression();
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const up = (event: PointerEvent) => {
      if (gesture.current?.id === event.pointerId) finish(false);
    };
    const cancel = (event: PointerEvent) => {
      if (gesture.current?.id === event.pointerId) finish(true);
    };
    const lostCapture = (event: PointerEvent) => {
      if (event.target === el) cancel(event);
    };
    const blur = () => finish(true);
    const sync = () => {
      const current = gesture.current;
      if (current && !canContinue(current)) finish(true);
    };
    const observer = railRoot ? new MutationObserver(sync) : null;
    observer?.observe(railRoot!, { attributes: true, attributeFilter: ["data-chapter", "data-rail-moving", "data-album-detail-open"] });

    el.addEventListener("pointerdown", down);
    el.addEventListener("click", click, true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", sync);
    el.addEventListener("lostpointercapture", lostCapture);

    return () => {
      // Release the drag-owned rail lock if this hook unmounts mid-gesture.
      finish(true);
      observer?.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("click", click, true);
      clearClickSuppression();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", sync);
      el.removeEventListener("lostpointercapture", lostCapture);
    };
  }, [enabled, chapterIndex, lifecycleKey, containerRef]);

  return { gesture, isDragging };
}

const ring = (a: number, b: number, len: number) => {
  let d = (b - a) % len;
  if (d > len / 2) d -= len;
  if (d < -len / 2) d += len;
  return d;
};

export function useMarqueeBelt({
  speed = 24,
  enabled = true,
  paused = false,
  length,
  pages = 1,
  chapterIndex = 2,
  onGrabStart,
  onGrabEnd,
}: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offset = useRef(0);
  const target = useRef<number | null>(null);
  const pageRef = useRef(0);
  const [page, setPage] = useState(0);

  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const lenRef = useRef(length);
  const pagesRef = useRef(pages);

  pausedRef.current = paused;
  speedRef.current = speed;
  lenRef.current = length;
  pagesRef.current = pages;

  const paint = useCallback(() => {
    const len = lenRef.current;
    const nPages = pagesRef.current;
    if (len <= 0) return;

    offset.current = ((offset.current % len) + len) % len;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${-offset.current}px,0,0)`;
    }

    const p = Math.min(nPages - 1, Math.floor((offset.current / len) * nPages));
    if (p !== pageRef.current) {
      pageRef.current = p;
      setPage(p);
    }
  }, []);

  const { gesture, isDragging } = useShelfPointerDrag(containerRef, {
    enabled,
    chapterIndex,
    onPress: () => { target.current = null; },
    onDelta: (distance) => { offset.current -= distance; paint(); },
    onGrabStart,
    onGrabEnd,
  });

  useEffect(() => {
    if (!enabled || !length) return;

    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    let raf: number | null = null;
    let disposed = false;
    let prev = performance.now();

    const canAnimate = () => !document.hidden && isMarqueeChapterActive(railRoot?.dataset, chapterIndex);

    const stop = () => {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    };

    const tick = (now: number) => {
      raf = null;
      if (disposed || !canAnimate()) return;

      const dt = Math.min(48, now - prev) / 1000;
      prev = now;
      const len = lenRef.current;
      if (len <= 0) return;

      if (target.current !== null) {
        const d = ring(offset.current, target.current, len);
        if (Math.abs(d) < 1) {
          offset.current = target.current;
          target.current = null;
        } else {
          offset.current += d * Math.min(1, dt * 5);
        }
      } else if (!pausedRef.current && !gesture.current) {
        offset.current += speedRef.current * dt;
      }

      paint();

      raf = requestAnimationFrame(tick);
    };

    const sync = () => {
      if (canAnimate()) {
        if (raf === null && !disposed) {
          prev = performance.now();
          raf = requestAnimationFrame(tick);
        }
      } else {
        stop();
      }
    };

    const observer = railRoot ? new MutationObserver(sync) : null;
    observer?.observe(railRoot!, {
      attributes: true,
      attributeFilter: ["data-chapter", "data-rail-moving", "data-album-detail-open"],
    });
    document.addEventListener("visibilitychange", sync);
    sync();

    return () => {
      disposed = true;
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [enabled, length, chapterIndex, paint, gesture]);

  const goTo = (p: number) => {
    const len = lenRef.current;
    if (len <= 0 || gesture.current) return;
    const nPages = pagesRef.current;
    const idx = Math.min(nPages - 1, Math.max(0, p));
    const stop = (len / nPages) * idx;
    target.current = offset.current + ring(offset.current, stop, len);
  };

  const stepPage = (dir: -1 | 1) => goTo(pageRef.current + dir);

  return { containerRef, trackRef, isDragging, page, goTo, stepPage };
}
