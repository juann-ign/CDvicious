"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler, PointerEventHandler } from "react";

const DRAG_SENSITIVITY = 0.42;
const KEY_STEP = 15;
const EASE_BACK_MS = 900;

interface DiscSurfacePointerHandlers {
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerUp: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
}

export function useDiscSurfaceDrag(disabled: boolean) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const rotationRef = useRef(0);
  const lastXRef = useRef(0);
  const easeFrameRef = useRef<number | null>(null);

  const stopEase = useCallback(() => {
    if (easeFrameRef.current !== null) {
      cancelAnimationFrame(easeFrameRef.current);
      easeFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!disabled) return;
    stopEase();
    rotationRef.current = 0;
    setRotation(0);
    setIsDragging(false);
  }, [disabled, stopEase]);

  const easeBack = useCallback(() => {
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
  }, [stopEase]);

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      stopEase();
      lastXRef.current = event.clientX;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [disabled, stopEase],
  );

  const onPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (
        disabled ||
        !event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        return;
      }

      const dx = event.clientX - lastXRef.current;
      lastXRef.current = event.clientX;

      const next = rotationRef.current + dx * DRAG_SENSITIVITY;
      rotationRef.current = next;
      setRotation(next);
    },
    [disabled],
  );

  const finishDrag = useCallback<PointerEventHandler<HTMLDivElement>>(
    (event) => {
      if (
        disabled ||
        !event.currentTarget.hasPointerCapture(event.pointerId)
      ) {
        return;
      }

      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsDragging(false);
      easeBack();
    },
    [disabled, easeBack],
  );

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>(
    (event) => {
      if (disabled) return;

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        stopEase();

        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = Math.max(
          -180,
          Math.min(180, rotationRef.current + direction * KEY_STEP),
        );

        rotationRef.current = next;
        setRotation(next);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        stopEase();
        rotationRef.current = -180;
        setRotation(-180);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        stopEase();
        rotationRef.current = 180;
        setRotation(180);
      }
    },
    [disabled, stopEase],
  );

  const pointerHandlers: DiscSurfacePointerHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onKeyDown,
  };

  useEffect(() => () => stopEase(), [stopEase]);

  return { rotation, isDragging, pointerHandlers };
}
