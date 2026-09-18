"use client";

import { useEffect, useRef, useState } from "react";

const DRAG_SENSITIVITY = 0.42;
const EASE_BACK_MS = 900;

export function useDiscSurfaceDrag<T extends HTMLElement>(
  targetRef: React.RefObject<T | null>,
  disabled: boolean,
) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rotationRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!disabled) return;

    rotationRef.current = 0;
    setRotation(0);
    setIsDragging(false);

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [disabled]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || disabled) return;

    let lastX = 0;

    const stopEase = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };

    const easeBack = () => {
      const from = rotationRef.current;
      const startedAt = performance.now();
      stopEase();

      const frame = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / EASE_BACK_MS);
        const eased = 1 - Math.pow(1 - progress, 3);
        const next = from * (1 - eased);

        rotationRef.current = next;
        setRotation(next);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(frame);
        } else {
          rotationRef.current = 0;
          setRotation(0);
          rafRef.current = null;
        }
      };

      rafRef.current = requestAnimationFrame(frame);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;

      event.preventDefault();
      stopEase();
      lastX = event.clientX;
      setIsDragging(true);

      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can be unavailable in embedded browser contexts.
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!target.hasPointerCapture?.(event.pointerId)) return;

      const dx = event.clientX - lastX;
      lastX = event.clientX;

      const next = rotationRef.current + dx * DRAG_SENSITIVITY;
      rotationRef.current = next;
      setRotation(next);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!target.hasPointerCapture?.(event.pointerId)) return;

      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore browsers that release capture automatically.
      }

      setIsDragging(false);
      easeBack();
    };

    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerUp);

    return () => {
      stopEase();
      target.removeEventListener("pointerdown", onPointerDown);
      target.removeEventListener("pointermove", onPointerMove);
      target.removeEventListener("pointerup", onPointerUp);
      target.removeEventListener("pointercancel", onPointerUp);
    };
  }, [disabled, targetRef]);

  return { rotation, isDragging };
}
