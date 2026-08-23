"use client";

import { useCallback, useRef, useState } from "react";

const DEFAULT_ROTATION = { x: 34, y: 0 };

export function useDiscDrag() {
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    last.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    last.current = { x: e.clientX, y: e.clientY };

    setRotation((prev) => ({
      x: Math.min(85, Math.max(0, prev.x - dy * 0.4)),
      y: prev.y + dx * 0.4,
    }));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
    setRotation(DEFAULT_ROTATION);
  }, []);

  return { rotation, isDragging, onPointerDown, onPointerMove, onPointerUp };
}
