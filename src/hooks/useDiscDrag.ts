"use client";

import { useRef, useCallback } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type { Group } from "three";

const Y_SCHEDULE: [number, number][] = [
  [0.0, -75],
  [2, 0],
  [5, 22],
  [11.5, 180],
  [16.0, 285],
].map(([t, deg]) => [t, (deg * Math.PI) / 180]);

const X_SCHEDULE: [number, number][] = [
  [0.0, 38],
  [2.0, 38],
  [5.0, 32],
  [8.2, 8],
  [11.5, 38],
  [16.0, 38],
].map(([t, deg]) => [t, (deg * Math.PI) / 180]);

const CYCLE_DURATION = 16.0;
const EASE_BACK_S = 0.9;
const DRAG_SENSITIVITY = 0.008;

function interpolate(schedule: [number, number][], elapsed: number): number {
  const t = elapsed % CYCLE_DURATION;
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

export function useDiscDrag(groupRef: React.RefObject<Group>) {
  const elapsed = useRef(0);
  const dragOffset = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const easeElapsed = useRef<number | null>(null);
  const easeFrom = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;

    if (easeElapsed.current !== null) {
      easeElapsed.current += delta;
      const t = Math.min(1, easeElapsed.current / EASE_BACK_S);
      dragOffset.current = easeFrom.current * (1 - t);
      if (t === 1) easeElapsed.current = null;
    }

    const rotY = interpolate(Y_SCHEDULE, elapsed.current) + dragOffset.current;
    const rotX = interpolate(X_SCHEDULE, elapsed.current);

    if (groupRef.current) {
      groupRef.current.rotation.set(rotX, rotY, 0);
    }
  });

  const onPointerDown = useCallback((e: ThreeEvent<PointerEvent>) => {
    dragging.current = true;
    lastX.current = e.clientX;
    easeElapsed.current = null;
    (e.target as any)?.setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    dragOffset.current += dx * DRAG_SENSITIVITY;
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
    easeFrom.current = dragOffset.current;
    easeElapsed.current = 0;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp };
}
