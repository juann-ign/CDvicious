"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import type { DiscFlightOrigin } from "@/lib/discFlightGeometry";
import styles from "./PhysicalDeck.module.css";
import { usePhysicalDeckLayout } from "@/hooks/usePhysicalDeckLayout";
import { PhysicalVolumeKnob } from "./PhysicalVolumeKnob";
import { PhysicalDeckFront } from "./PhysicalDeckFront";
import { DeckLiftLatch } from "./DeckLiftLatch";
import type { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";
import { useDeckLiftPrototype } from "@/hooks/useDeckLiftPrototype";
import type { DeckLiftPhase } from "@/lib/deckLiftPrototype";
import type { SpotifyTrack } from "@/types/spotify";
import type { HistoricalDiscPresentation, HistoricalDiscStatus } from "@/lib/historicalFreeDisc";
const HistoricalFreeDisc = dynamic(() => import("./HistoricalFreeDisc").then(module => module.HistoricalFreeDisc), { ssr: false });

export type PhysicalDeckPose = "wait" | "open" | "docked";

export interface PhysicalDeckProps {
  pose: PhysicalDeckPose;
  albumName?: string;
  artwork?: string;
  statusText?: string;
  displayTitle?: string;
  artistText?: string;
  progressMs?: number | null;
  durationMs?: number | null;
  showDisc?: boolean;
  lidOffset?: number;
  isPlaying?: boolean;
  staticMode?: boolean;
  discVisual?: DiscFlightOrigin | null;
  className?: string;
  discTargetRef?: Ref<HTMLDivElement>;
  controls?: ReturnType<typeof useCanonicalPlayerControls>;
  controlsActive?: boolean;
  albumId?: string;
  liftEnabled?: boolean;
  liftActive?: boolean;
  liftBusy?: boolean;
  onLiftPhaseChange?: (phase: DeckLiftPhase) => void;
  track?: SpotifyTrack | null;
  accentColor?: string;
  loading?: boolean;
}

const poseLabels: Record<PhysicalDeckPose, string> = {
  wait: "en espera, tapas juntas y receptáculo vacío",
  open: "abierto, tapas desplazadas y eje expuesto",
  docked: "con el CD horizontal acoplado y visible",
};

function DiscCorners() {
  return <>
    <span className={`${styles.poseCorner} ${styles.topLeft}`} data-disc-pose-corner="tl" />
    <span className={`${styles.poseCorner} ${styles.topRight}`} data-disc-pose-corner="tr" />
    <span className={`${styles.poseCorner} ${styles.bottomLeft}`} data-disc-pose-corner="bl" />
    <span className={`${styles.poseCorner} ${styles.bottomRight}`} data-disc-pose-corner="br" />
    <span className={styles.poseCenter} data-disc-pose-center />
  </>;
}

function DiscFace({ albumName, artwork }: { albumName: string; artwork?: string }) {
  return <>
    <span className={styles.discEdge} />
    <span className={styles.discLabel}>
      {artwork ? <Image src={artwork} alt="" fill sizes="320px" unoptimized draggable={false} /> : <span className={styles.discLettering}><strong>{albumName}</strong><small>CDVICIOUS · COMPACT DISC</small></span>}
    </span>
    <span className={styles.discReflection} />
    <span className={styles.discClearRing} />
  </>;
}

/**
 * One physical model, camera and lighting for all review poses. Loading and
 * playback state stay with the caller. The unitless lid offset is in design pixels:
 * 0 closes the halves; 135 exposes the mechanism. The destination plane stays
 * dimensioned when its visual disc is hidden, for a later geometric handoff.
 */
export function PhysicalDeck({ pose, albumName = "COMPACT DISC", artwork, statusText, displayTitle, artistText, progressMs = null, durationMs = null, showDisc = true, lidOffset, isPlaying = false, staticMode = false, discVisual, className, discTargetRef, controls, controlsActive = true, albumId, liftEnabled = false, liftActive = false, liftBusy = false, onLiftPhaseChange, track, accentColor = "#1DB954", loading = false }: PhysicalDeckProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const nativeTarget = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const foregroundRef = useRef<HTMLDivElement>(null);
  const liftButtonRef = useRef<HTMLButtonElement>(null);
  const presentation = useRef<HistoricalDiscPresentation | null>(null);
  const [historicalStatus, setHistoricalStatus] = useState<HistoricalDiscStatus>("loading");
  const updatePresentation = useCallback((sample: Parameters<HistoricalDiscPresentation["update"]>[0]) => presentation.current?.update(sample), []);
  const resetPresentation = useCallback(() => presentation.current?.reset(), []);
  const registerDisc = useCallback((node: HTMLDivElement | null) => {
    nativeTarget.current = node;
    if (typeof discTargetRef === "function") discTargetRef(node);
    else if (discTargetRef) discTargetRef.current = node;
  }, [discTargetRef]);
  const lift = useDeckLiftPrototype({ viewport: viewportRef, placement: placementRef, scene: sceneRef, target: nativeTarget, home: homeRef, anchor: anchorRef, host: foregroundRef, button: liftButtonRef },
    { enabled: liftEnabled, active: liftActive, busy: liftBusy, hasDisc: showDisc && pose === "docked", identity: albumId ?? albumName, onPhase: onLiftPhaseChange,
      externalGesture: liftEnabled, presentationReady: !liftEnabled || historicalStatus !== "loading", onPresentation: updatePresentation, onRestore: resetPresentation });
  usePhysicalDeckLayout(viewportRef, placementRef, sceneRef, albumName);
  const acceptedRef = useRef<HTMLDivElement>(null);
  const priorVisual = useRef(discVisual);
  const visualGeneration = useRef(0);
  if (priorVisual.current !== discVisual) { priorVisual.current = discVisual; visualGeneration.current++; }
  useLayoutEffect(() => {
    const host = acceptedRef.current;
    if (!host || !discVisual) return;
    const replica = discVisual.visual.cloneNode(true) as HTMLElement;
    const scale = document.createElement("div");
    Object.assign(scale.style, { position: "absolute", left: "0px", top: "0px", width: `${discVisual.width}px`, height: `${discVisual.height}px`, transformOrigin: "0 0", pointerEvents: "none" });
    scale.append(replica);
    host.append(scale);
    const resize = () => { scale.style.transform = `scale(${host.clientWidth / discVisual.width},${host.clientHeight / discVisual.height})`; };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    return () => { observer.disconnect(); scale.remove(); };
  }, [discVisual]);
  const style = { "--deck-lid-offset": lidOffset ?? (pose === "open" ? 135 : 0) } as CSSProperties;
  const rotorStyle = { animation: staticMode ? "none" : undefined, animationPlayState: isPlaying && !lift.dragging && lift.phase === "docked" && pose === "docked" && !staticMode ? "running" : "paused" } as CSSProperties;
  return <div ref={viewportRef} className={[styles.viewport, className].filter(Boolean).join(" ")} data-physical-deck data-deck-render-density="2" data-deck-pose={pose} role={controls ? "group" : "img"} aria-label={`Reproductor de CD ${poseLabels[pose]}${pose === "wait" ? "" : `: ${albumName}`}`}>
    <div ref={placementRef} className={styles.placement} style={style} data-deck-mechanism data-disc-spinning={isPlaying && !lift.dragging && pose === "docked" && !staticMode} data-deck-static={staticMode}>
    <div ref={sceneRef} className={styles.scene} data-deck-design-frame>
      <div className={styles.floorShadow} aria-hidden="true" />
      <div className={styles.machine}>
        <div className={styles.baseSurface} data-deck-surface />
        <div className={styles.loadingWell} />
        <div className={`${styles.guideRails} ${styles.guidesLeft}`}><i /><i /><b /><b /></div>
        <div className={`${styles.guideRails} ${styles.guidesRight}`}><i /><i /><b /><b /></div>
        <div className={styles.socket} data-deck-socket>
          <span className={styles.socketRecess} />
          <span className={styles.spindle}><i /></span>
          <span className={`${styles.retainer} ${styles.retainerA}`} />
          <span className={`${styles.retainer} ${styles.retainerB}`} />
          <span className={`${styles.retainer} ${styles.retainerC}`} />
        </div>

        <div className={styles.discHome} ref={homeRef}>
        <div className={`${styles.discTarget} ${styles.discAnchor}`} ref={anchorRef} aria-hidden="true">
          <span className={`${styles.poseCorner} ${styles.topLeft}`} data-prototype-dock-corner="tl" />
          <span className={`${styles.poseCorner} ${styles.topRight}`} data-prototype-dock-corner="tr" />
          <span className={`${styles.poseCorner} ${styles.bottomLeft}`} data-prototype-dock-corner="bl" />
          <span className={`${styles.poseCorner} ${styles.bottomRight}`} data-prototype-dock-corner="br" />
        </div>
        <div className={styles.discTarget} ref={registerDisc} data-deck-disc-target data-disc-diameter-ratio="120" data-disc-hole-ratio="15" aria-hidden="true">
          <div className={styles.physicalDiscRepresentation} data-physical-disc-representation>
          <div className={styles.dockedDisc} style={{ visibility: pose === "docked" && showDisc && !discVisual ? "visible" : "hidden" }} data-deck-docked-disc>
            <div key={albumName} className={styles.spinRotor} style={rotorStyle} data-physical-disc-rotor><DiscFace albumName={albumName} artwork={artwork} /></div>
          </div>
          <div className={styles.acceptedVisualHost} style={{ visibility: pose === "docked" && showDisc && discVisual ? "visible" : "hidden" }} data-deck-inserted-disc><div key={visualGeneration.current} ref={acceptedRef} className={styles.spinRotor} style={rotorStyle} data-physical-disc-rotor /></div>
          </div>
          {liftEnabled && track && showDisc && track.album.id === albumId && <HistoricalFreeDisc key={track.album.id}
            track={track} accentColor={accentColor} isPlaying={isPlaying} reducedMotion={staticMode} phase={lift.phase}
            target={nativeTarget} presentation={presentation} onStatus={setHistoricalStatus}
            beginGesture={lift.beginVisualGesture} endGesture={lift.endVisualGesture} returning={lift.visualReturning} />}
          <DiscCorners />
        </div>
        </div>
        {liftEnabled && <DeckLiftLatch buttonRef={liftButtonRef} onActivate={lift.lift}
          raised={lift.phase !== "docked"}
          disabled={!liftActive || liftBusy || !showDisc || pose !== "docked" || lift.phase !== "docked" || historicalStatus === "loading"} />}

        <div className={`${styles.lid} ${styles.lidLeft}`} data-deck-lid="left">
          <div className={`${styles.lidSurface} ${styles.leftSurface}`} data-deck-surface aria-hidden="true"><span className={styles.topRailSlot} /><span className={styles.lidRim} /></div>
          <span className={styles.lidFrontEdge} /><span className={styles.lidOuterEdge} />
        </div>
        <div className={`${styles.lid} ${styles.lidRight}`} data-deck-lid="right">
          <div className={`${styles.lidSurface} ${styles.rightSurface}`} data-deck-surface aria-hidden="true"><span className={styles.topRailSlot} /><span className={styles.lidRim} /></div>
          <span className={styles.lidFrontEdge} /><span className={styles.lidOuterEdge} />
        </div>

        <div className={styles.sideLeft} data-deck-surface /><div className={styles.sideRight} data-deck-surface />
        <div className={styles.frontFace} data-deck-front data-deck-surface>
          <span className={`${styles.screw} ${styles.screwA}`} /><span className={`${styles.screw} ${styles.screwB}`} />
          <span className={`${styles.screw} ${styles.screwC}`} /><span className={`${styles.screw} ${styles.screwD}`} />
          {controls ? <PhysicalVolumeKnob value={controls.volume} disabled={!controlsActive || !controls.volumeAvailable || controls.volumeLoading || controls.blocked} pending={controls.volumePending} error={controls.volumeError} onChange={controls.setVolume} /> : <span className={styles.rotary}><i /></span>}
          <PhysicalDeckFront title={displayTitle ?? (pose === "wait" ? "CDVICIOUS" : albumName)}
            artist={artistText} status={statusText} pose={pose} isPlaying={isPlaying} loading={loading}
            progressMs={progressMs} durationMs={durationMs} controls={controls} controlsActive={controlsActive}
            trackId={track?.id} />
        </div>
        <span className={`${styles.foot} ${styles.footLeft}`} data-deck-surface /><span className={`${styles.foot} ${styles.footRight}`} data-deck-surface />
      </div>

      <div className={styles.airDisc} data-deck-air-disc style={{ visibility: pose === "open" && showDisc ? "visible" : "hidden" }} aria-hidden="true">
        <DiscFace albumName={albumName} artwork={artwork} />
        <DiscCorners />
      </div>
    </div>
    </div>
    <div ref={foregroundRef} className={styles.prototypeDiscHost} data-prototype-disc-host />
    {liftEnabled && lift.phase === "free" && (historicalStatus === "unavailable" || historicalStatus === "error") && <span className={styles.prototypeGestureHint} role="status">Vista estática · 3D no disponible</span>}
    {liftEnabled && historicalStatus === "loading" && showDisc && <span className={styles.prototypeGestureHint} role="status">Preparando CD 3D…</span>}
    {liftEnabled && lift.phase !== "docked" && <DeckLiftLatch mode="dock" onActivate={lift.recouple}
      raised={lift.phase === "aligning" || lift.phase === "lowering" || lift.phase === "closing"}
      disabled={lift.phase !== "free" || liftBusy || lift.dragging} />}
    {liftEnabled && lift.error && <span role="status" className={styles.prototypeLiftError}>{lift.error}</span>}
  </div>;
}
