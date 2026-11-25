"use client";

import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import { RailContext } from "./scroll/RailContext";
import styles from "./DeckLiftLatch.module.css";

export interface DeckLiftLatchProps {
  onActivate(): void;
  mode?: "lift" | "dock";
  disabled?: boolean;
  raised?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
}

const THRESHOLD = .65;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type LatchGesture = { pointer: number; x: number; y: number; initial: number; value: number; travel: number; moved: boolean; resume(): void };

/** A visual loading latch. It requests the existing lift or dock action once; it owns
 * only its pointer gesture and a matching rail interaction lock. */
export function DeckLiftLatch({ onActivate, mode = "lift", disabled = false, raised = false, buttonRef }: DeckLiftLatchProps) {
  const rail = useContext(RailContext);
  const railRef = useRef(rail); railRef.current = rail;
  const latest = useRef({ onActivate, mode, disabled, raised }); latest.current = { onActivate, mode, disabled, raised };
  const button = useRef<HTMLButtonElement | null>(null);
  const gesture = useRef<LatchGesture | null>(null);
  const suppressClick = useRef(false);
  const mounted = useRef(true);
  const [progress, setProgress] = useState(raised ? 1 : 0);
  const progressRef = useRef(progress); progressRef.current = progress;
  const [dragging, setDragging] = useState(false);
  const registerButton = useCallback((node: HTMLButtonElement | null) => {
    button.current = node;
    if (typeof buttonRef === "function") buttonRef(node);
    else if (buttonRef) buttonRef.current = node;
  }, [buttonRef]);

  const finish = useCallback((release: boolean) => {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    const activate = release && current.moved && current.value >= THRESHOLD && !latest.current.disabled && !latest.current.raised;
    if (current.moved || !release) suppressClick.current = true;
    try {
      if (button.current?.hasPointerCapture(current.pointer)) button.current.releasePointerCapture(current.pointer);
    } finally { current.resume(); }
    if (mounted.current) { setDragging(false); setProgress(latest.current.raised ? 1 : 0); }
    if (activate) latest.current.onActivate();
  }, []);

  useLayoutEffect(() => {
    if (disabled || raised) finish(false);
    if (!gesture.current) setProgress(raised ? 1 : 0);
  }, [disabled, raised, finish]);
  useEffect(() => {
    mounted.current = true;
    const blur = () => finish(false);
    const hidden = () => { if (document.visibilityState === "hidden") finish(false); };
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => { mounted.current = false; finish(false); window.removeEventListener("blur", blur); window.removeEventListener("resize", blur); document.removeEventListener("visibilitychange", hidden); };
  }, [finish]);

  return <div className={styles.latch} style={{ "--latch-progress": progress } as CSSProperties}
    data-deck-lift-latch={mode === "lift" ? true : undefined} data-deck-dock-latch={mode === "dock" ? true : undefined}
    data-latch-mode={mode} data-latch-progress={progress.toFixed(3)} data-latch-dragging={dragging} data-latch-raised={raised}>
    <button ref={registerButton} type="button" className={styles.action} aria-label={mode === "dock" ? "Acoplar CD al equipo" : "Elevar CD del equipo"}
      aria-pressed={raised} title={mode === "dock" ? "Deslizá el asa hacia abajo y soltá. También podés hacer clic o pulsar Enter o Espacio." : "Deslizá el asa hacia arriba y soltá. También podés hacer clic o pulsar Enter o Espacio."}
      disabled={disabled} data-lenis-prevent
      onPointerDown={event => {
        if (event.button !== 0 || latest.current.disabled || latest.current.raised || gesture.current) return;
        event.stopPropagation(); event.currentTarget.focus({ preventScroll: true }); suppressClick.current = false;
        const rect = event.currentTarget.getBoundingClientRect();
        const owner = railRef.current, lock = Symbol(mode === "dock" ? "deck-dock-latch" : "deck-lift-latch"); owner?.stop(lock);
        gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, initial: progressRef.current,
          value: progressRef.current, travel: Math.max(16, rect.height * 60 / 115), moved: false, resume: () => owner?.start(lock) };
        setDragging(true);
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { finish(false); }
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.pointer !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        current.moved ||= Math.hypot(event.clientX - current.x, event.clientY - current.y) >= 4;
        const distance = latest.current.mode === "dock" ? event.clientY - current.y : current.y - event.clientY;
        current.value = clamp(current.initial + distance / current.travel);
        setProgress(current.value);
      }}
      onPointerUp={event => { if (gesture.current?.pointer === event.pointerId) { event.stopPropagation(); finish(true); } }}
      onPointerCancel={event => { if (gesture.current?.pointer === event.pointerId) { event.stopPropagation(); finish(false); } }}
      onLostPointerCapture={() => finish(false)} onBlur={() => finish(false)}
      onWheel={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === "Escape" && gesture.current) { event.preventDefault(); event.stopPropagation(); finish(false); }
        else if (event.key === "Enter" || event.key === " ") event.stopPropagation();
      }}
      onClick={event => {
        event.preventDefault(); event.stopPropagation();
        if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
        suppressClick.current = false;
        if (!latest.current.disabled && !latest.current.raised) latest.current.onActivate();
      }}>
      <span className={styles.label} aria-hidden="true">{mode === "dock" ? "ACOPLAR CD" : "ELEVAR CD"}</span>
      <span className={styles.slot} aria-hidden="true" />
      <span className={styles.direction} aria-hidden="true" />
      <span className={styles.signal} aria-hidden="true" />
      <span className={styles.handle} aria-hidden="true"><span className={styles.grip} /></span>
    </button>
  </div>;
}
