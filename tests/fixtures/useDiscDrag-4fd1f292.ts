"use client";

import { useRef, useCallback, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
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
const IDLE_ROTATION_SPEED = 0.18;

const IDLE_ROTATION_X = X_SCHEDULE[0][1];
const IDLE_ROTATION_Y = Y_SCHEDULE[0][1];

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

export function useDiscDrag(
  groupRef: React.RefObject<Group>,
  active: boolean,
  isPlaying: boolean,
) {
  const { gl } = useThree();

  const elapsed = useRef(0);
  const idleElapsed = useRef(0);
  const dragOffset = useRef(0);

  const dragging = useRef(false);
  const lastX = useRef(0);

  const easeElapsed = useRef<number | null>(null);
  const easeFrom = useRef(0);

  const idleDragBaseY = useRef(IDLE_ROTATION_Y);

  const wasActive = useRef(active);

  useEffect(() => {
    if (active && !wasActive.current) {
      elapsed.current = 0;
      dragOffset.current = 0;
      easeElapsed.current = null;
    }

    wasActive.current = active;
  }, [active]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    if (easeElapsed.current !== null) {
      easeElapsed.current += delta;

      const t = Math.min(1, easeElapsed.current / EASE_BACK_S);

      dragOffset.current = easeFrom.current * (1 - t);

      if (t === 1) {
        easeElapsed.current = null;
      }
    }

    if (!active) {
      if (!dragging.current) {
        idleElapsed.current += delta;

        const idleRotationY =
          IDLE_ROTATION_Y +
          idleElapsed.current * IDLE_ROTATION_SPEED +
          dragOffset.current;

        groupRef.current.rotation.set(IDLE_ROTATION_X, idleRotationY, 0);
      } else {
        groupRef.current.rotation.set(
          IDLE_ROTATION_X,
          idleDragBaseY.current + dragOffset.current,
          0,
        );
      }

      return;
    }

    if (isPlaying && !dragging.current) {
      elapsed.current += delta * 1.4;
    }

    const rotY = interpolate(Y_SCHEDULE, elapsed.current) + dragOffset.current;
    const rotX = interpolate(X_SCHEDULE, elapsed.current);

    groupRef.current.rotation.set(rotX, rotY, 0);
  });

  const handleWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current) return;

    const dx = e.clientX - lastX.current;

    lastX.current = e.clientX;

    dragOffset.current += dx * DRAG_SENSITIVITY;
  }, []);

  const stopDragging = useCallback(() => {
    if (!dragging.current) return;

    dragging.current = false;

    easeFrom.current = dragOffset.current;
    easeElapsed.current = 0;

    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  }, [handleWindowPointerMove]);

  /*
   * CAMBIO CLAVE: en vez de depender de que R3F le pegue con el raycast a
   * un mesh específico (lo cual falla cuando el disco está de canto por el
   * tilt+spin del idle), escuchamos pointerdown directo sobre el <canvas>.
   * El canvas de DiscCanvas está dedicado 100% al disco — no hay nada más
   * ahí para interactuar — así que "pointerdown en cualquier parte del
   * canvas" es un proxy perfecto y 100% confiable de "el usuario quiere
   * agarrar el disco", sin importar el ángulo 3D en el que esté.
   */
  useEffect(() => {
    const canvas = gl.domElement;

    function handlePointerDown(e: PointerEvent) {
      dragging.current = true;
      lastX.current = e.clientX;
      easeElapsed.current = null;

      if (!active && groupRef.current) {
        idleDragBaseY.current = groupRef.current.rotation.y;
      }

      window.addEventListener("pointermove", handleWindowPointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    }

    canvas.addEventListener("pointerdown", handlePointerDown);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [gl, active, groupRef, handleWindowPointerMove, stopDragging]);
}
