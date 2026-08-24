"use client";

import { useEffect, useRef, useCallback } from "react";

// [segundos, ángulo Y (giro horizontal)] — SIEMPRE creciente, nunca retrocede
const Y_SCHEDULE: [number, number][] = [
  [0.0, -75],
  [2, 0],
  [5, 22],
  [11.5, 180],
  [16.0, 285],
];

// [segundos, ángulo X (inclinación)] — controla qué tan "de canto" se ve en cada tramo
const X_SCHEDULE: [number, number][] = [
  [0.0, 38],
  [2.0, 38],
  [5.0, 32],
  [8.2, 8], // cerca del canto, se endereza casi vertical
  [11.5, 38],
  [16.0, 38],
];

const CYCLE_DURATION = Y_SCHEDULE[Y_SCHEDULE.length - 1][0];
const EASE_BACK_MS = 900;

function interpolate(
  schedule: [number, number][],
  elapsedSeconds: number,
): number {
  const t = elapsedSeconds % CYCLE_DURATION;
  for (let i = 0; i < schedule.length - 1; i++) {
    const [t0, a0] = schedule[i];
    const [t1, a1] = schedule[i + 1];
    if (t >= t0 && t <= t1) {
      const progress = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return a0 + (a1 - a0) * progress;
    }
  }
  return schedule[0][1];
}

export function useDiscSpin() {
  const elRef = useRef<HTMLDivElement>(null);
  const startTime = useRef<number | null>(null);
  const dragOffset = useRef(0);
  const draggingRef = useRef(false);
  const lastX = useRef(0);
  const easeStart = useRef<number | null>(null);
  const easeFromOffset = useRef(0);

  useEffect(() => {
    let raf: number;

    function tick(time: number) {
      if (startTime.current === null) startTime.current = time;
      const elapsed = (time - startTime.current) / 1000;

      if (easeStart.current !== null) {
        const t = Math.min(1, (time - easeStart.current) / EASE_BACK_MS);
        dragOffset.current = easeFromOffset.current * (1 - t);
        if (t === 1) easeStart.current = null;
      }

      const angleY = interpolate(Y_SCHEDULE, elapsed) + dragOffset.current;
      const angleX = interpolate(X_SCHEDULE, elapsed);

      if (elRef.current) {
        elRef.current.style.transform = `rotateX(${angleX}deg) rotateY(${angleY}deg)`;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    lastX.current = e.clientX;
    easeStart.current = null;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    dragOffset.current += dx * 0.5;
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    easeFromOffset.current = dragOffset.current;
    easeStart.current = performance.now();
  }, []);

  return { elRef, onPointerDown, onPointerMove, onPointerUp };
}
