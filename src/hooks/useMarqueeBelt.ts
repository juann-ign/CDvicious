"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  speed?: number;
  paused?: boolean;
  length: number;
  pages?: number;
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
}

const DRAG_THRESHOLD_PX = 6;

const ring = (a: number, b: number, len: number) => {
  let d = (b - a) % len;
  if (d > len / 2) d -= len;
  if (d < -len / 2) d += len;
  return d;
};

export function useMarqueeBelt({
  speed = 24,
  paused = false,
  length,
  pages = 1,
  onGrabStart,
  onGrabEnd,
}: Options) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const offset = useRef(0);
  const velocity = useRef(0);
  const target = useRef<number | null>(null);
  const dragging = useRef(false);
  const captured = useRef(false);
  const pointerId = useRef<number | null>(null);
  const lastX = useRef(0);
  const pageRef = useRef(0);
  const [isDragging, setIsDragging] = useState(false);
  const [page, setPage] = useState(0);

  const pausedRef = useRef(paused);
  const speedRef = useRef(speed);
  const lenRef = useRef(length);
  const pagesRef = useRef(pages);
  const onGrabStartRef = useRef(onGrabStart);
  const onGrabEndRef = useRef(onGrabEnd);

  pausedRef.current = paused;
  onGrabStartRef.current = onGrabStart;
  onGrabEndRef.current = onGrabEnd;
  speedRef.current = speed;
  lenRef.current = length;
  pagesRef.current = pages;

  useEffect(() => {
    if (!length) return;
    let raf = 0;
    let prev = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(48, now - prev) / 1000;
      prev = now;
      const len = lenRef.current;
      const nPages = pagesRef.current;

      if (target.current !== null) {
        const d = ring(offset.current, target.current, len);
        if (Math.abs(d) < 1 || dragging.current) {
          target.current = null;
        } else {
          offset.current += d * Math.min(1, dt * 5);
        }
      } else {
        const drift =
          pausedRef.current || dragging.current ? 0 : speedRef.current;
        offset.current += (drift + velocity.current) * dt;
        velocity.current *= Math.pow(0.001, dt);
        if (Math.abs(velocity.current) < 0.5) velocity.current = 0;
      }

      offset.current = ((offset.current % len) + len) % len;

      if (trackRef.current) {
        trackRef.current.style.transform =
          "translate3d(" + -offset.current + "px,0,0)";
      }

      const p = Math.min(
        nPages - 1,
        Math.floor((offset.current / len) * nPages),
      );
      if (p !== pageRef.current) {
        pageRef.current = p;
        setPage(p);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [length]);

  const goTo = (p: number) => {
    const len = lenRef.current;
    const nPages = pagesRef.current;
    const idx = Math.min(nPages - 1, Math.max(0, p));
    const stop = (len / nPages) * idx;
    target.current = offset.current + ring(offset.current, stop, len);
  };

  const stepPage = (dir: -1 | 1) => goTo(pageRef.current + dir);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const down = (e: PointerEvent) => {
      dragging.current = true;
      captured.current = false;
      pointerId.current = e.pointerId;
      lastX.current = e.clientX;
      target.current = null;
    };

    const finish = (snap: boolean) => {
      if (!dragging.current) return;

      const wasCaptured = captured.current;
      const currentPointerId = pointerId.current;

      if (wasCaptured && snap) {
        const len = lenRef.current;
        const nPages = pagesRef.current;

        if (len > 0) {
          const stop =
            Math.round((offset.current / len) * nPages) * (len / nPages);
          target.current = offset.current + ring(offset.current, stop, len);
        }
      }

      dragging.current = false;
      captured.current = false;
      pointerId.current = null;
      setIsDragging(false);

      if (wasCaptured) {
        onGrabEndRef.current?.();
      }

      if (
        wasCaptured &&
        currentPointerId !== null &&
        el.hasPointerCapture?.(currentPointerId)
      ) {
        el.releasePointerCapture(currentPointerId);
      }
    };

    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;

      if (!captured.current && Math.abs(dx) > DRAG_THRESHOLD_PX) {
        captured.current = true;
        setIsDragging(true);
        onGrabStartRef.current?.();

        if (pointerId.current !== null) {
          el.setPointerCapture?.(pointerId.current);
        }
      }

      if (!captured.current) return;

      lastX.current = e.clientX;
      offset.current -= dx;
      velocity.current = -dx * 8;
    };

    const up = () => finish(true);
    const cancel = () => finish(false);
    const lostCapture = () => finish(false);

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", lostCapture);

    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", lostCapture);
    };
  }, []);

  return { containerRef, trackRef, isDragging, page, goTo, stepPage };
}
