"use client";

import { useCallback, useRef, useState } from "react";

const BASE_TILT = 40; // "apoyado" mirando de arriba hacia abajo, como pediste
const TILT_MIN = 15;
const TILT_MAX = 80;

export function useDiscTilt() {
  const [tilt, setTilt] = useState(BASE_TILT);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const lastY = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    lastY.current = e.clientY;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = e.clientY - lastY.current;
    lastY.current = e.clientY;
    setTilt((prev) => Math.min(TILT_MAX, Math.max(TILT_MIN, prev - dy * 0.4)));
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    setIsDragging(false);
    setTilt(BASE_TILT);
  }, []);

  return { tilt, isDragging, onPointerDown, onPointerMove, onPointerUp };
}
