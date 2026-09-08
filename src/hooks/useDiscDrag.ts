"use client";

import { useRef, useCallback, useEffect } from "react";
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
  const elapsed = useRef(0);

  // Tiempo de la rotación idle cuando no hay track.
  const idleElapsed = useRef(0);

  // Offset horizontal producido por el usuario.
  const dragOffset = useRef(0);

  const dragging = useRef(false);
  const lastX = useRef(0);

  const easeElapsed = useRef<number | null>(null);
  const easeFrom = useRef(0);

  // Ángulo base del idle cuando comienza un drag.
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

    /*
     * Suavizado del regreso después del drag.
     * Esto es compartido por idle y showcase.
     */
    if (easeElapsed.current !== null) {
      easeElapsed.current += delta;

      const t = Math.min(1, easeElapsed.current / EASE_BACK_S);

      dragOffset.current = easeFrom.current * (1 - t);

      if (t === 1) {
        easeElapsed.current = null;
      }
    }

    /*
     * ============================================================
     * IDLE — SIN TRACK
     * ============================================================
     *
     * Esta es la única rama nueva/modificada.
     *
     * Mientras se arrastra:
     * - congelamos el tiempo idle
     * - no dejamos que el showcase idle pelee contra el mouse
     *
     * Cuando no se arrastra:
     * - continúa la rotación idle normalmente.
     */
    if (!active) {
      if (!dragging.current) {
        idleElapsed.current += delta;

        const idleRotationY =
          IDLE_ROTATION_Y +
          idleElapsed.current * IDLE_ROTATION_SPEED +
          dragOffset.current;

        groupRef.current.rotation.set(IDLE_ROTATION_X, idleRotationY, 0);
      } else {
        /*
         * Durante el drag conservamos exactamente el ángulo
         * idle que había cuando comenzó el arrastre y sumamos
         * solamente el movimiento del usuario.
         */
        groupRef.current.rotation.set(
          IDLE_ROTATION_X,
          idleDragBaseY.current + dragOffset.current,
          0,
        );
      }

      return;
    }

    /*
     * ============================================================
     * TRACK / SHOWCASE
     * ============================================================
     *
     * ESTA PARTE SE MANTIENE IGUAL que el comportamiento que
     * ya funcionaba con canciones.
     */
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

  const onPointerDown = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      dragging.current = true;

      lastX.current = e.clientX;

      easeElapsed.current = null;

      /*
       * Si estamos en idle, congelamos la posición actual
       * para que el movimiento del mouse parta exactamente
       * desde donde estaba el CD.
       */
      if (!active && groupRef.current) {
        idleDragBaseY.current = groupRef.current.rotation.y;
      }

      window.addEventListener("pointermove", handleWindowPointerMove);

      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    },
    [active, groupRef, handleWindowPointerMove, stopDragging],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);

      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [handleWindowPointerMove, stopDragging]);

  return { onPointerDown };
}
