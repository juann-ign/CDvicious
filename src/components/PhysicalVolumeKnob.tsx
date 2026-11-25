"use client";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { RailContext } from "./scroll/RailContext";
import styles from "./PhysicalDeck.module.css";

type KnobRect = { left: number; top: number; width: number; height: number };
export type VolumeKnobGesture = {
  mode: "rotate" | "linear";
  value: number;
  x: number;
  y: number;
  angle: number;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  travel: number;
  axis: "x" | "y" | null;
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const angleAt = (model: Pick<VolumeKnobGesture, "centerX" | "centerY" | "radiusX" | "radiusY">, x: number, y: number) =>
  Math.atan2((x - model.centerX) / model.radiusX, -(y - model.centerY) / model.radiusY) * 180 / Math.PI;

/** Relative rotation avoids a jump on grab; the rendered ellipse is normalized. */
export function beginVolumeKnobGesture(rect: KnobRect, x: number, y: number, value: number): VolumeKnobGesture {
  const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
  const radiusX = Math.max(1, rect.width / 2), radiusY = Math.max(1, rect.height / 2);
  const model: VolumeKnobGesture = { mode: Math.hypot((x - centerX) / radiusX, (y - centerY) / radiusY) >= .3 ? "rotate" : "linear",
    value: clamp(value), x, y, angle: 0, centerX, centerY, radiusX, radiusY, travel: Math.max(90, rect.width * 1.5), axis: null };
  model.angle = angleAt(model, x, y);
  return model;
}

export function moveVolumeKnobGesture(model: VolumeKnobGesture, x: number, y: number): number {
  if (model.mode === "rotate") {
    // Ignore the center where angular direction is undefined, without jumping
    // when the pointer comes back onto the rim.
    if (Math.hypot((x - model.centerX) / model.radiusX, (y - model.centerY) / model.radiusY) < .15) { model.angle = Number.NaN; return Math.round(model.value * 100) / 100; }
    const angle = angleAt(model, x, y);
    if (!Number.isFinite(model.angle)) { model.angle = angle; return Math.round(model.value * 100) / 100; }
    const delta = ((angle - model.angle + 540) % 360) - 180;
    model.value = clamp(model.value + delta / 270);
    model.angle = angle;
  } else {
    const dx = x - model.x, dy = y - model.y;
    if (!model.axis && Math.max(Math.abs(dx), Math.abs(dy)) < 2) return Math.round(model.value * 100) / 100;
    model.axis ??= Math.abs(dy) >= Math.abs(dx) ? "y" : "x";
    model.value = clamp(model.value + (model.axis === "y" ? -dy : dx) / model.travel);
  }
  model.x = x; model.y = y;
  return Math.round(model.value * 100) / 100;
}

export function PhysicalVolumeKnob({ value, disabled, pending, error, onChange }: { value: number | null; disabled: boolean; pending: boolean; error: string | null; onChange: (value: number) => void }) {
  const rail = useContext(RailContext);
  const railRef = useRef(rail); railRef.current = rail;
  const token = useRef(Symbol("physical-volume"));
  const [dragValue, setDragValue] = useState<number | null>(null);
  const gesture = useRef<{ pointer: number; model: VolumeKnobGesture; element: HTMLElement; resume: () => void } | null>(null);
  // Cleanup owns the actions captured at pointerdown, not a later context object.
  const release = useCallback(() => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    setDragValue(null);
    try { if (current.element.hasPointerCapture(current.pointer)) current.element.releasePointerCapture(current.pointer); }
    finally { current.resume(); }
  }, []);
  useEffect(() => { if (disabled) release(); return release; }, [disabled, release]);
  useEffect(() => {
    const visibility = () => { if (document.visibilityState === "hidden") release(); };
    window.addEventListener("blur", release); window.addEventListener("resize", release); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", release); window.removeEventListener("resize", release); document.removeEventListener("visibilitychange", visibility); };
  }, [release]);
  const shown = dragValue ?? value;
  return <div className={styles.rotary} role="slider" aria-label="Volumen del equipo" aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={shown === null ? undefined : Math.round(shown * 100)} aria-valuetext={shown === null ? "No disponible" : `${Math.round(shown * 100)}%`}
    aria-disabled={disabled} aria-busy={pending} tabIndex={disabled ? -1 : 0} data-lenis-prevent data-physical-volume data-volume-dragging={dragValue !== null}
    title={error ?? (disabled ? "Volumen no disponible en el dispositivo actual" : "Arrastrá el borde para girar, o el centro arriba/abajo. También podés usar las flechas.")}
    onPointerDown={event => {
      event.stopPropagation();
      if (disabled || event.button !== 0 || value === null || gesture.current) return;
      event.preventDefault(); event.currentTarget.focus();
      const owner = railRef.current, ownerToken = token.current;
      owner?.stop(ownerToken);
      gesture.current = { pointer: event.pointerId, model: beginVolumeKnobGesture(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY, value), element: event.currentTarget, resume: () => owner?.start(ownerToken) };
      setDragValue(value);
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { release(); }
    }}
    onPointerMove={event => {
      const current = gesture.current;
      if (!current || current.pointer !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      const next = moveVolumeKnobGesture(current.model, event.clientX, event.clientY);
      setDragValue(next); onChange(next);
    }}
    onPointerUp={event => { event.stopPropagation(); if (gesture.current?.pointer === event.pointerId) release(); }}
    onPointerCancel={event => { event.stopPropagation(); if (gesture.current?.pointer === event.pointerId) release(); }}
    onLostPointerCapture={event => { if (gesture.current?.pointer === event.pointerId) release(); }}
    onWheel={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); release(); return; }
      if (disabled || value === null) return;
      const delta = ["ArrowUp", "ArrowRight"].includes(event.key) ? .01 : ["ArrowDown", "ArrowLeft"].includes(event.key) ? -.01 : event.key === "PageUp" ? .1 : event.key === "PageDown" ? -.1 : 0;
      if (!delta && event.key !== "Home" && event.key !== "End") return;
      event.preventDefault(); event.stopPropagation(); release(); onChange(event.key === "Home" ? 0 : event.key === "End" ? 1 : clamp(value + delta));
    }}>
    <i aria-hidden="true" style={{ transform: `rotate(${(shown ?? 0) * 270 - 135}deg)` }} />
    <span className={styles.volumeValue} aria-hidden="true">{shown === null ? "—" : Math.round(shown * 100)}</span>
    <span className={styles.volumeScale} aria-hidden="true"><span>0</span><span>100</span></span>
  </div>;
}
