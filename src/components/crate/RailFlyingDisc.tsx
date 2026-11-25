"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { discRegistry } from "@/lib/discRegistry";
import { bindDiscQuad, DISC_FLIGHT_DURATION_MS, quadToCssMatrix, sampleDiscFlight, sampleDiscLoad, supportsDiscFlightMotion, type DiscFlightOrigin, type DiscLoadPhase, type DiscQuad } from "@/lib/discFlightGeometry";
import type { StartPlayExecution } from "@/lib/discPlayback";
import { getPlaybackState, subscribePlaybackState } from "@/lib/playbackSnapshotCoordinator";
import { useRailActions } from "@/components/scroll/RailContext";
import styles from "./RailFlyingDisc.module.css";

interface RailFlyingDiscProps {
  origin: DiscFlightOrigin;
  execution: StartPlayExecution;
  onArrive: () => void;
  onDone: () => void;
}

/** The portal carries the captured physical CD, not a newly painted circle. */
export function RailFlyingDisc({ origin, execution, onArrive, onDone }: RailFlyingDiscProps) {
  const { isReady, scrollToChapter } = useRailActions();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const onArriveRef = useRef(onArrive);
  const onDoneRef = useRef(onDone);
  const arrivedRef = useRef(false);
  const doneRef = useRef(false);
  const ownerRef = useRef(execution.attempt.attemptId);
  const lifetimeRef = useRef(0);
  onArriveRef.current = onArrive;
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    if (!isReady) return;
    const attemptId = execution.attempt.attemptId;
    if (ownerRef.current !== attemptId) {
      ownerRef.current = attemptId;
      arrivedRef.current = false;
      doneRef.current = false;
    }
    if (doneRef.current) return;
    const epoch = ++lifetimeRef.current;
    const ownsLifetime = () => lifetimeRef.current === epoch;
    const surface = surfaceRef.current;
    const visual = visualRef.current;
    if (!surface || !visual) return;
    const replica = origin.visual.cloneNode(true) as HTMLElement;
    visual.replaceChildren(replica);
    visual.style.visibility = "visible";
    const firstMatrix = quadToCssMatrix(origin.quad, origin.width, origin.height);
    if (firstMatrix) surface.style.transform = firstMatrix;
    surface.style.visibility = "visible";

    let frame = 0;
    let stopped = false;
    let lastPhase = "";
    let lastTarget: DiscQuad | null = null;
    let lastAir: DiscQuad | null = null;
    let targetElement: HTMLElement | null = null;
    let readSpindle: ReturnType<typeof bindDiscQuad> = null;
    let readAir: ReturnType<typeof bindDiscQuad> = null;
    let mechanism: HTMLElement | null = null;
    let lastSpin = 0;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const startedAt = performance.now();
    const setLids = (offset: number) => {
      if (getPlaybackState().attempt?.attemptId !== attemptId || !mechanism) return;
      const value = String(offset);
      if (mechanism.style.getPropertyValue("--deck-lid-offset") !== value) {
        mechanism.style.setProperty("--deck-lid-offset", value);
      }
    };
    const publishPhase = (phase: string) => {
      if (lastPhase === phase) return;
      lastPhase = phase;
      surface.dataset.flightPhase = phase;
      window.dispatchEvent(new CustomEvent("cdvicious:deck-load-pose", { detail: { attemptId, phase } }));
    };
    const connectTarget = () => {
      const target = discRegistry.discTarget;
      if (!target?.isConnected) return false;
      if (target !== targetElement || !mechanism?.isConnected || !readSpindle || !readAir) {
        const deck = target.closest<HTMLElement>("[data-physical-deck]");
        mechanism = deck?.querySelector<HTMLElement>("[data-deck-mechanism]") ?? null;
        readSpindle = bindDiscQuad(target);
        readAir = bindDiscQuad(deck?.querySelector<HTMLElement>("[data-deck-air-disc]") ?? null);
        targetElement = target;
      }
      return Boolean(mechanism);
    };
    const readTarget = (phase?: DiscLoadPhase) => {
      // Only sample the pose used by this frame. Both are checked at launch,
      // and lowering always reads both after applying the current lid pose.
      if (!lastTarget || !phase || phase === "lowering" || phase === "closing" || phase === "complete") {
        lastTarget = readSpindle?.() ?? lastTarget;
      }
      if (!lastAir || !phase || phase === "travelling" || phase === "opening" || phase === "lowering") {
        lastAir = readAir?.() ?? lastAir;
      }
      return lastTarget && lastAir && mechanism ? { target: lastTarget, air: lastAir } : null;
    };
    const finish = (phase = "complete") => {
      if (doneRef.current) return;
      doneRef.current = true;
      stopped = true;
      cancelAnimationFrame(frame);
      setLids(0);
      publishPhase(phase);
      surface.style.visibility = "hidden";
      visual.replaceChildren();
      window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-done", { detail: { attemptId } }));
      onDoneRef.current();
    };
    const dock = (quad: DiscQuad) => {
      if (arrivedRef.current) return true;
      if (!execution.markDocked()) return false;
      arrivedRef.current = true;
      publishPhase("docked");
      window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-arrived", { detail: { attemptId, origin, quad } }));
      window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-playback-ready", { detail: { attemptId } }));
      onArriveRef.current();
      // The persistent rotor now owns this exact captured visual. Retain only
      // the mechanical closing clock; no second CD covers its first spin.
      visual.style.visibility = "hidden";
      return true;
    };
    const paint = (now: number) => {
      if (stopped || doneRef.current) return false;
      const current = getPlaybackState();
      if (current.attempt?.attemptId !== attemptId || ["failed", "cancelled"].includes(current.phase)) {
        finish("cancelled");
        return false;
      }
      const elapsed = now - startedAt;
      const load = sampleDiscLoad(elapsed);
      // Mechanical pose and the fitted player transform share this frame.
      // Apply the pose before measuring the actual spindle/air planes.
      const connected = connectTarget();
      setLids(load.lidOffset);
      if (arrivedRef.current) {
        // The seated CD is already owned by the persistent deck. Closing
        // only needs the lid clock, not reads/writes for an invisible portal.
        surface.dataset.flightProgress = load.progress.toFixed(5);
        if (load.complete) { finish(); return false; }
        publishPhase(load.phase);
        return true;
      }
      const measured = connected ? readTarget(load.phase) : null;
      if (!measured) {
        execution.cancel();
        finish("cancelled");
        return false;
      }
      const state = sampleDiscFlight(origin.quad, measured.target, measured.air, elapsed);
      const matrix = quadToCssMatrix(state.quad, origin.width, origin.height);
      if (!matrix) {
        execution.cancel();
        finish("cancelled");
        return false;
      }
      surface.style.transform = matrix;
      if (state.spin !== lastSpin) {
        lastSpin = state.spin;
        visual.style.transform = state.spin === 0 ? "" : `rotate(${state.spin}deg)`;
      }
      surface.dataset.flightProgress = state.progress.toFixed(5);
      surface.dataset.flightSpin = state.spin.toFixed(2);
      surface.dataset.flightRoll = String(Math.atan2(state.quad.tr.y - state.quad.tl.y, state.quad.tr.x - state.quad.tl.x) * 180 / Math.PI);
      publishPhase(state.phase);
      if (state.docked && !dock(state.quad)) {
        finish("cancelled");
        return false;
      }
      if (state.complete) {
        finish();
        return false;
      }
      return true;
    };
    const tick = (now: number) => {
      if (paint(now)) frame = requestAnimationFrame(tick);
    };
    const instantDock = () => {
      if (stopped) return;
      cancelAnimationFrame(frame);
      scrollToChapter(0, 0, "flight");
      const connected = connectTarget();
      setLids(0);
      const measured = connected ? readTarget() : null;
      const matrix = measured && quadToCssMatrix(measured.target, origin.width, origin.height);
      if (!matrix) {
        execution.cancel();
        finish("cancelled");
        return;
      }
      surface.style.transform = matrix;
      surface.dataset.flightProgress = "1";
      if (!dock(measured!.target)) { finish("cancelled"); return; }
      finish();
    };
    const watchAttempt = () => {
      const state = getPlaybackState();
      if (state.attempt?.attemptId !== attemptId || ["failed", "cancelled"].includes(state.phase)) finish("cancelled");
    };
    const resize = () => { if (!document.hidden && !stopped) paint(performance.now()); };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !stopped) frame = requestAnimationFrame(tick);
    };
    const preference = () => { if (media.matches) instantDock(); };
    const unsubscribe = subscribePlaybackState(watchAttempt);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", preference);

    if (media.matches || !supportsDiscFlightMotion()) instantDock();
    else {
      scrollToChapter(0, DISC_FLIGHT_DURATION_MS / 1000, "flight");
      paint(startedAt);
      if (!stopped && !document.hidden) frame = requestAnimationFrame(tick);
    }
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      unsubscribe();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", preference);
      setLids(0);
      visual.replaceChildren();
      // React's development effect replay is not a user cancellation. A real
      // unmount still cancels this attempt after its synchronous cleanup.
      queueMicrotask(() => {
        const state = getPlaybackState();
        if (ownsLifetime() && !doneRef.current && state.attempt?.attemptId === attemptId && state.busy) execution.cancel();
      });
    };
  }, [execution, isReady, origin, scrollToChapter]);

  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.overlay} aria-hidden="true" inert>
    <div ref={surfaceRef} className={styles.disc} data-testid="rail-flying-disc" data-attempt-id={execution.attempt.attemptId} data-flight-phase="lifting" data-flight-progress="0"
      style={{ width: origin.width, height: origin.height, transform: quadToCssMatrix(origin.quad, origin.width, origin.height) ?? undefined }}>
      <div ref={visualRef} className={styles.visual} />
      <span className={styles.corner} data-flight-pose-corner="tl" style={{ left: 0, top: 0 }} />
      <span className={styles.corner} data-flight-pose-corner="tr" style={{ left: "100%", top: 0 }} />
      <span className={styles.corner} data-flight-pose-corner="bl" style={{ left: 0, top: "100%" }} />
      <span className={styles.corner} data-flight-pose-corner="br" style={{ left: "100%", top: "100%" }} />
    </div>
  </div>, document.body);
}
