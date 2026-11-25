"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Euler, Quaternion, Vector3, type Group } from "three";
import type { SpotifyTrack } from "@/types/spotify";
import type { DiscDragState } from "@/hooks/useDiscDrag";
import { supportsDiscFlightMotion } from "@/lib/discFlightGeometry";
import { HISTORICAL_DISC_CANVAS_SIZE, HISTORICAL_DISC_FACE_RATIO, HISTORICAL_DISC_FACE_X, type HistoricalDiscPresentation, type HistoricalDiscStatus } from "@/lib/historicalFreeDisc";
import type { DeckLiftPhase, DeckLiftSample } from "@/lib/deckLiftPrototype";
import styles from "./PhysicalDeck.module.css";

const DiscCanvas = dynamic(() => import("./three/DiscCanvas").then(module => module.DiscCanvas), { ssr: false });
const face = new Quaternion().setFromEuler(new Euler(HISTORICAL_DISC_FACE_X, 0, 0));
const inPlaneAxis = new Vector3(0, 1, 0);

class RendererBoundary extends Component<{ children: ReactNode; onError(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

interface Props {
  track: SpotifyTrack;
  accentColor: string;
  isPlaying: boolean;
  phase: DeckLiftPhase;
  reducedMotion: boolean;
  target: RefObject<HTMLDivElement | null>;
  presentation: RefObject<HistoricalDiscPresentation | null>;
  onStatus(status: HistoricalDiscStatus): void;
  beginGesture(): boolean;
  endGesture(): void;
  returning(value: boolean): void;
}

/** The old renderer lives inside the existing physical CD carrier. Its only
 * integration transform bridges a front-facing frame to/from the real plane. */
export function HistoricalFreeDisc(props: Props) {
  const latest = useRef(props); latest.current = props;
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<HistoricalDiscStatus>("loading");
  const statusRef = useRef(status);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const group = useRef<Group | null>(null);
  const sample = useRef<DeckLiftSample>({ phase: "docked", lid: 0, progress: 0, retreat: 0 });
  const alignment = useRef<Quaternion | null>(null);
  const alignedFace = useRef(face.clone());
  const serial = useRef(0);
  const changeStatus = useCallback((next: HistoricalDiscStatus) => {
    statusRef.current = next; setStatus(next); latest.current.onStatus(next);
    const target = latest.current.target.current;
    if (target) target.dataset.historicalDiscStatus = next;
    if (next !== "ready" && target) target.dataset.discRepresentation = "css";
  }, []);
  const represent = useCallback((three: boolean) => {
    const target = latest.current.target.current;
    if (!target) return;
    target.dataset.discRepresentation = three && statusRef.current === "ready" ? "three" : "css";
  }, []);
  const update = useCallback((next: DeckLiftSample) => {
    if (next.phase === "opening" && sample.current.phase === "docked") {
      const target = latest.current.target.current;
      const hosts = target?.querySelectorAll<HTMLElement>("[data-deck-docked-disc], [data-deck-inserted-disc]");
      const visible = hosts && [...hosts].find(node => node.style.visibility === "visible");
      const rotor = visible?.querySelector<HTMLElement>("[data-physical-disc-rotor]");
      const transform = rotor ? getComputedStyle(rotor).transform : "none";
      const matrix = transform === "none" ? null : new DOMMatrixReadOnly(transform);
      const spin = matrix ? Math.atan2(matrix.b, matrix.a) : 0;
      // The historical disc lies in XZ: its positive local Y rotation is the
      // opposite screen direction to the physical CSS rotor's rotateZ.
      alignedFace.current.copy(face).multiply(new Quaternion().setFromAxisAngle(inPlaneAxis, -spin));
    }
    if (next.phase === "aligning" && sample.current.phase !== "aligning") alignment.current = group.current?.quaternion.clone() ?? alignedFace.current.clone();
    sample.current = next;
    const visible = ["lifting", "free", "aligning"].includes(next.phase);
    if (visible) represent(true);
    // Lowering swaps only after a real aligned Three frame has been drawn.
    // This avoids acknowledging a 493ms frame as the final 500ms pose.
    else if (!["lowering"].includes(next.phase)) represent(false);
  }, [represent]);
  const reset = useCallback(() => {
    sample.current = { phase: "docked", lid: 0, retreat: 0, progress: 0 }; alignment.current = null; represent(false);
  }, [represent]);

  useLayoutEffect(() => {
    props.presentation.current = { update, reset };
    latest.current.onStatus("loading");
    const target = props.target.current;
    if (!target) return;
    target.dataset.historicalDiscStatus = "loading"; target.dataset.discRepresentation = "css";
    const size = () => target.style.setProperty("--historical-canvas-scale", String(target.clientWidth / (HISTORICAL_DISC_CANVAS_SIZE * HISTORICAL_DISC_FACE_RATIO)));
    size(); const observer = new ResizeObserver(size); observer.observe(target);
    return () => { observer.disconnect(); props.presentation.current = null; target.style.removeProperty("--historical-canvas-scale"); delete target.dataset.discRepresentation; delete target.dataset.historicalDiscStatus; };
  }, [props.presentation, props.target, update, reset]);
  useEffect(() => {
    if (!supportsDiscFlightMotion()) { changeStatus("unavailable"); return; }
    setSupported(true);
  }, [changeStatus]);

  const ready = useCallback((element: HTMLCanvasElement) => {
    canvas.current = element;
    element.dataset.historicalDiscCanvas = "true"; element.dataset.threeReady = "true";
    changeStatus("ready"); update(sample.current);
  }, [changeStatus, update]);
  const context = useCallback((available: boolean) => { changeStatus(available ? "loading" : "error"); }, [changeStatus]);
  const frame = useCallback((mesh: Group, motion: DiscDragState) => {
    group.current = mesh;
    const current = sample.current, historical = mesh.quaternion.clone();
    if (current.phase === "lifting") mesh.quaternion.slerpQuaternions(alignedFace.current, historical, current.progress);
    else if (current.phase === "aligning") mesh.quaternion.slerpQuaternions(alignment.current ?? historical, alignedFace.current, current.progress);
    else if (current.phase !== "free") mesh.quaternion.copy(alignedFace.current);
    const element = canvas.current;
    if (!element) return;
    element.dataset.threeRotation = `${mesh.rotation.x},${mesh.rotation.y},${mesh.rotation.z}`;
    element.dataset.threeElapsed = String(motion.elapsed); element.dataset.threeDragOffset = String(motion.dragOffset);
    element.dataset.threeDragging = String(motion.dragging); element.dataset.threeReturning = String(motion.returning);
    element.dataset.threePresentation = current.phase; element.dataset.threeGroupUuid = mesh.uuid;
    const number = ++serial.current;
    queueMicrotask(() => {
      if (canvas.current !== element) return;
      element.dataset.threePaintedFrame = String(number); element.dataset.threePaintedPresentation = current.phase;
      if (sample.current.phase === "lowering" && current.phase === "lowering") represent(false);
    });
  }, [represent]);

  return <div className={styles.historicalFreeDisc} data-historical-free-disc data-historical-renderer-status={status} aria-hidden="true">
    {supported && <RendererBoundary onError={() => changeStatus("error")}>
      <div className={styles.historicalCanvas}>
        <DiscCanvas track={props.track} isPlaying={props.isPlaying} accentColor={props.accentColor}
          renderEnabled={status === "loading" || status === "ready" && props.phase !== "docked"}
          onFirstFrame={ready} onContextAvailability={context} onDiscFrame={frame}
          dragOptions={{ enabled: status === "ready" && props.phase === "free", reducedMotion: props.reducedMotion,
            interactionTarget: props.target, onGestureStart: props.beginGesture, onGestureEnd: props.endGesture, onReturnStateChange: props.returning }} />
      </div>
    </RendererBoundary>}
  </div>;
}
