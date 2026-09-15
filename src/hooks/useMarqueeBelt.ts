"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  speed?: number;
  paused?: boolean;
  length: number;
  pages?: number;
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
  pausedRef.current = paused;
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
        trackRef.current.style.transform = `translate3d(${-offset.current}px,0,0)`;
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
      // OJO: no capturamos el puntero acá todavía. Ver comentario en `move`.
    };

    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;

      // Solo capturamos el puntero si confirmamos drag real (>6px). Capturar
      // de entrada en pointerdown retargea el `click` resultante al
      // contenedor en vez del jewel case debajo del cursor — es el bug que
      // ya resolvimos una vez, no reintroducirlo.
      if (!captured.current && Math.abs(dx) > DRAG_THRESHOLD_PX) {
        captured.current = true;
        setIsDragging(true);
        if (pointerId.current !== null) {
          el.setPointerCapture?.(pointerId.current);
        }
      }

      if (!captured.current) return;

      lastX.current = e.clientX;
      offset.current -= dx;
      velocity.current = -dx * 8;
    };

    const up = () => {
      if (captured.current && pointerId.current !== null) {
        el.releasePointerCapture?.(pointerId.current);
      }
      if (captured.current) {
        const len = lenRef.current;
        const nPages = pagesRef.current;
        const stop =
          Math.round((offset.current / len) * nPages) * (len / nPages);
        target.current = offset.current + ring(offset.current, stop, len);
      }
      dragging.current = false;
      captured.current = false;
      pointerId.current = null;
      setIsDragging(false);
    };

    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return { containerRef, trackRef, isDragging, page, goTo, stepPage };
}
