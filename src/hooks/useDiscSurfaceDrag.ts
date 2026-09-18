"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler, PointerEventHandler } from "react";

const DRAG_SENSITIVITY = 0.5;
const KEY_STEP = 15;
const EASE_BACK_MS = 900;

interface DiscSurfacePointerHandlers {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

export function useDiscSurfaceDrag(disabled: boolean) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rotationRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const easeFrameRef = useRef<number | null>(null);

  const stopEase = useCallback(() => {
    if (easeFrameRef.current !== null) {
      cancelAnimationFrame(easeFrameRef.current);
      easeFrameRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = event.clientX - lastXRef.current;
    lastXRef.current = event.clientX;
    const next = Math.max(-180, Math.min(180, rotationRef.current + dx * DRAG_SENSITIVITY));
    rotationRef.current = next;
    setRotation(next);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
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
        easeFrameRef.current = requestAnimationFrame(frame);
      } else {
        rotationRef.current = 0;
        setRotation(0);
        easeFrameRef.current = null;
      }
    };
    easeFrameRef.current = requestAnimationFrame(frame);

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerUp);
  }, [handlePointerMove, stopEase]);

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      stopEase();
      draggingRef.current = true;
      setIsDragging(true);
      lastXRef.current = event.clientX;
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [disabled, handlePointerMove, handlePointerUp, stopEase],
  );

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      stopEase();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = Math.max(-180, Math.min(180, rotationRef.current + direction * KEY_STEP));
      rotationRef.current = next;
      setRotation(next);
    },
    [disabled, stopEase],
  );

  useEffect(() => {
    if (disabled) {
      stopEase();
      rotationRef.current = 0;
      setRotation(0);
      setIsDragging(false);
      draggingRef.current = false;
      return;
    }
    return () => {
      draggingRef.current = false;
      stopEase();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [disabled, handlePointerMove, handlePointerUp, stopEase]);

  return {
    rotation,
    isDragging,
    pointerHandlers: { onPointerDown, onKeyDown },
  };
}