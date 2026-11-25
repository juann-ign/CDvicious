"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEventHandler, PointerEventHandler } from "react";

const DRAG_SENSITIVITY = 0.5;
const KEY_STEP = 15;
const EASE_BACK_MS = 900;

export function useDiscSurfaceDrag(disabled: boolean) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rotationRef = useRef(0);
  const draggingRef = useRef(false);
  const lastXRef = useRef(0);
  const easeFrameRef = useRef<number | null>(null);
  const cleanupGestureRef = useRef<() => void>(() => undefined);
  const reducedMotionRef = useRef(false);

  const stopEase = useCallback(() => {
    if (easeFrameRef.current !== null) {
      cancelAnimationFrame(easeFrameRef.current);
      easeFrameRef.current = null;
    }
  }, []);

  // Consumers with pointer capture can terminate the entire gesture on lost
  // capture, inactivity or blur, including listeners and the return animation.
  const cancel = useCallback(() => {
    cleanupGestureRef.current();
    cleanupGestureRef.current = () => undefined;
    draggingRef.current = false;
    stopEase();
    rotationRef.current = 0;
    setRotation(0);
    setIsDragging(false);
  }, [stopEase]);

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>((event) => {
    if (disabled || event.button !== 0 || draggingRef.current) return;
    event.preventDefault();
    stopEase();
    cleanupGestureRef.current();
    draggingRef.current = true;
    setIsDragging(true);
    lastXRef.current = event.clientX;
    const pointerId = event.pointerId;

    const move = (nativeEvent: PointerEvent) => {
      if (!draggingRef.current || nativeEvent.pointerId !== pointerId) return;
      const dx = nativeEvent.clientX - lastXRef.current;
      lastXRef.current = nativeEvent.clientX;
      const next = Math.max(-180, Math.min(180, rotationRef.current + dx * DRAG_SENSITIVITY));
      rotationRef.current = next;
      setRotation(next);
    };
    const finish = (nativeEvent: PointerEvent) => {
      if (!draggingRef.current || nativeEvent.pointerId !== pointerId) return;
      cleanupGestureRef.current();
      cleanupGestureRef.current = () => undefined;
      draggingRef.current = false;
      setIsDragging(false);
      const from = rotationRef.current;
      if (reducedMotionRef.current || Math.abs(from) < .01) {
        rotationRef.current = 0;
        setRotation(0);
        return;
      }
      const startedAt = performance.now();
      const frame = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / EASE_BACK_MS);
        const next = from * Math.pow(1 - progress, 3);
        rotationRef.current = next;
        setRotation(next);
        easeFrameRef.current = progress < 1 ? requestAnimationFrame(frame) : null;
      };
      easeFrameRef.current = requestAnimationFrame(frame);
    };
    const cancelPointer = (nativeEvent: PointerEvent) => {
      if (nativeEvent.pointerId === pointerId) cancel();
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancelPointer);
    };
    cleanupGestureRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancelPointer);
  }, [disabled, cancel, stopEase]);

  const onKeyDown = useCallback<KeyboardEventHandler<HTMLDivElement>>((event) => {
    if (disabled || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    stopEase();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = Math.max(-180, Math.min(180, rotationRef.current + direction * KEY_STEP));
    rotationRef.current = next;
    setRotation(next);
  }, [disabled, stopEase]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      reducedMotionRef.current = media.matches;
      if (media.matches) cancel();
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [cancel]);

  useEffect(() => {
    if (disabled) cancel();
    return cancel;
  }, [disabled, cancel]);

  return { rotation, isDragging, cancel, pointerHandlers: { onPointerDown, onKeyDown } };
}
