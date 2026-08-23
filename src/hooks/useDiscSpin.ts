"use client";

import { useEffect, useRef, useCallback } from "react";

const BASE_SPEED = 0.12; // grados por frame, giro ambiental constante
const DRAG_MULTIPLIER = 0.6;
const EASE_BACK_MS = 1200;

export function useDiscSpin(tiltX = 10) {
  const elRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(0);
  const speedRef = useRef(BASE_SPEED);
  const draggingRef = useRef(false);
  const lastX = useRef(0);
  const easeStart = useRef<number | null>(null);
  const easeFromSpeed = useRef(BASE_SPEED);

  useEffect(() => {
    let raf: number;

    function tick(time: number) {
      if (easeStart.current !== null) {
        const t = Math.min(1, (time - easeStart.current) / EASE_BACK_MS);
        speedRef.current =
          easeFromSpeed.current + (BASE_SPEED - easeFromSpeed.current) * t;
        if (t === 1) easeStart.current = null;
      }

      angleRef.current = (angleRef.current + speedRef.current) % 360;

      if (elRef.current) {
        elRef.current.style.transform = `rotateX(${tiltX}deg) rotateY(${angleRef.current}deg)`;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tiltX]);

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
    // uso el valor absoluto del movimiento a propósito: así el drag
    // siempre acelera el giro horario, nunca lo invierte
    speedRef.current = BASE_SPEED + Math.abs(dx) * DRAG_MULTIPLIER;
  }, []);

  const onPointerUp = useCallback(() => {
    draggingRef.current = false;
    easeFromSpeed.current = speedRef.current;
    easeStart.current = performance.now();
  }, []);

  return { elRef, onPointerDown, onPointerMove, onPointerUp };
}
