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

export interface DiscDragState { elapsed: number; idleElapsed: number; dragOffset: number; dragging: boolean; returning: boolean }
export interface DiscDragOptions {
  enabled?: boolean;
  reducedMotion?: boolean;
  interactionTarget?: React.RefObject<HTMLElement | null>;
  onGestureStart?: () => boolean;
  onGestureEnd?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
  onReturnStateChange?: (returning: boolean) => void;
  onPose?: (pose: { x: number; y: number; z: number }, state: DiscDragState) => void;
}

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
  options: DiscDragOptions = {},
) {
  const { gl } = useThree();
  const optionsRef = useRef(options); optionsRef.current = options;

  const elapsed = useRef(0);
  const idleElapsed = useRef(0);
  const dragOffset = useRef(0);

  const dragging = useRef(false);
  const lastX = useRef(0);

  const easeElapsed = useRef<number | null>(null);
  const easeFrom = useRef(0);

  const idleDragBaseY = useRef(IDLE_ROTATION_Y);

  const wasActive = useRef(active);
  const pointerId = useRef<number | null>(null);
  const getState = useCallback((): DiscDragState => ({ elapsed: elapsed.current, idleElapsed: idleElapsed.current, dragOffset: dragOffset.current, dragging: dragging.current, returning: easeElapsed.current !== null }), []);

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

    const enabled = optionsRef.current.enabled !== false;
    const reduced = optionsRef.current.reducedMotion === true;
    if (easeElapsed.current !== null && enabled) {
      easeElapsed.current += delta;

      const t = Math.min(1, easeElapsed.current / EASE_BACK_S);

      dragOffset.current = easeFrom.current * (1 - t);

      if (t === 1) {
        easeElapsed.current = null;
        optionsRef.current.onReturnStateChange?.(false);
      }
    }

    if (!active) {
      if (!dragging.current) {
        if (enabled && !reduced) idleElapsed.current += delta;

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

      optionsRef.current.onPose?.(groupRef.current.rotation, getState());
      return;
    }

    if (isPlaying && !dragging.current && enabled && !reduced) {
      elapsed.current += delta * 1.4;
    }

    const rotY = interpolate(Y_SCHEDULE, elapsed.current) + dragOffset.current;
    const rotX = interpolate(X_SCHEDULE, elapsed.current);

    groupRef.current.rotation.set(rotX, rotY, 0);
    optionsRef.current.onPose?.(groupRef.current.rotation, getState());
  });

  const handleWindowPointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || optionsRef.current.enabled === false) return;

    const dx = e.clientX - lastX.current;

    lastX.current = e.clientX;

    dragOffset.current += dx * DRAG_SENSITIVITY;
  }, []);

  const stopDragging = useCallback(() => {
    if (!dragging.current) return;

    dragging.current = false;

    easeFrom.current = dragOffset.current;
    easeElapsed.current = 0;
    if (optionsRef.current.reducedMotion) { dragOffset.current = 0; easeElapsed.current = null; }
    optionsRef.current.onDragStateChange?.(false);
    optionsRef.current.onReturnStateChange?.(easeElapsed.current !== null);
    optionsRef.current.onGestureEnd?.();
    const captured = pointerId.current; pointerId.current = null;
    if (captured !== null && gl.domElement.hasPointerCapture?.(captured)) gl.domElement.releasePointerCapture(captured);

    window.removeEventListener("pointermove", handleWindowPointerMove);
    window.removeEventListener("pointerup", stopDragging);
    window.removeEventListener("pointercancel", stopDragging);
  }, [gl, handleWindowPointerMove]);

  const cancelInteraction = useCallback(() => {
    stopDragging();
    dragOffset.current = 0; easeElapsed.current = null;
    optionsRef.current.onReturnStateChange?.(false);
  }, [stopDragging]);

  useEffect(() => { if (options.enabled === false) cancelInteraction(); }, [options.enabled, cancelInteraction]);

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
      if (optionsRef.current.enabled === false || dragging.current || (e.button !== undefined && e.button !== 0)) return;
      if (optionsRef.current.onGestureStart?.() === false) return;
      e.preventDefault?.(); e.stopPropagation?.();
      optionsRef.current.interactionTarget?.current?.focus({ preventScroll: true });
      dragging.current = true;
      lastX.current = e.clientX;
      easeElapsed.current = null;
      optionsRef.current.onDragStateChange?.(true); optionsRef.current.onReturnStateChange?.(false);
      pointerId.current = e.pointerId ?? null;
      if (pointerId.current !== null) {
        try { canvas.setPointerCapture?.(pointerId.current); } catch { /* window listeners retain the gesture */ }
      }

      if (!active && groupRef.current) {
        idleDragBaseY.current = groupRef.current.rotation.y;
      }

      window.addEventListener("pointermove", handleWindowPointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);
    }

    const keyTarget = optionsRef.current.interactionTarget?.current ?? canvas;
    function keydown(e: KeyboardEvent) {
      if (optionsRef.current.enabled === false || !["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.key === "Home") { if (dragging.current) stopDragging(); else { easeFrom.current = dragOffset.current; easeElapsed.current = optionsRef.current.reducedMotion ? null : 0; if (optionsRef.current.reducedMotion) dragOffset.current = 0; optionsRef.current.onReturnStateChange?.(easeElapsed.current !== null); } return; }
      if (!dragging.current) {
        if (optionsRef.current.onGestureStart?.() === false) return;
        dragging.current = true; easeElapsed.current = null;
        optionsRef.current.onDragStateChange?.(true); optionsRef.current.onReturnStateChange?.(false);
      }
      dragOffset.current += (e.key === "ArrowRight" ? 20 : -20) * DRAG_SENSITIVITY;
    }
    const keyup = (e: KeyboardEvent) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.stopPropagation(); stopDragging(); } };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("lostpointercapture", stopDragging);
    keyTarget.addEventListener("keydown", keydown); keyTarget.addEventListener("keyup", keyup);
    keyTarget.addEventListener("blur", stopDragging);
    window.addEventListener("blur", stopDragging);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("lostpointercapture", stopDragging);
      keyTarget.removeEventListener("keydown", keydown); keyTarget.removeEventListener("keyup", keyup);
      keyTarget.removeEventListener("blur", stopDragging);
      window.removeEventListener("blur", stopDragging);
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
      cancelInteraction();
    };
  }, [gl, active, groupRef, handleWindowPointerMove, stopDragging, cancelInteraction]);
  return getState;
}
