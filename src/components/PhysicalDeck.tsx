"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, type CSSProperties, type Ref } from "react";
import type { DiscFlightOrigin } from "@/lib/discFlightGeometry";
import styles from "./PhysicalDeck.module.css";
import { usePhysicalDeckLayout } from "@/hooks/usePhysicalDeckLayout";
import { PhysicalVolumeKnob } from "./PhysicalVolumeKnob";
import { ProgressBar } from "./ProgressBar";
import type { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";

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
export function PhysicalDeck({ pose, albumName = "COMPACT DISC", artwork, statusText, displayTitle, artistText, progressMs = null, durationMs = null, showDisc = true, lidOffset, isPlaying = false, staticMode = false, discVisual, className, discTargetRef, controls, controlsActive = true }: PhysicalDeckProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const placementRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
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
  const rotorStyle = { animation: staticMode ? "none" : undefined, animationPlayState: isPlaying && pose === "docked" && !staticMode ? "running" : "paused" } as CSSProperties;
  return <div ref={viewportRef} className={[styles.viewport, className].filter(Boolean).join(" ")} data-physical-deck data-deck-render-density="2" data-deck-pose={pose} role={controls ? "group" : "img"} aria-label={`Reproductor de CD ${poseLabels[pose]}${pose === "wait" ? "" : `: ${albumName}`}`}>
    <div ref={placementRef} className={styles.placement} style={style} data-deck-mechanism data-disc-spinning={isPlaying && pose === "docked" && !staticMode} data-deck-static={staticMode}>
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

        <div className={styles.discTarget} ref={discTargetRef} data-deck-disc-target data-disc-diameter-ratio="120" data-disc-hole-ratio="15" aria-hidden="true">
          <div className={styles.dockedDisc} style={{ visibility: pose === "docked" && showDisc && !discVisual ? "visible" : "hidden" }} data-deck-docked-disc>
            <div key={albumName} className={styles.spinRotor} style={rotorStyle}><DiscFace albumName={albumName} artwork={artwork} /></div>
          </div>
          <div className={styles.acceptedVisualHost} style={{ visibility: pose === "docked" && showDisc && discVisual ? "visible" : "hidden" }} data-deck-inserted-disc><div key={visualGeneration.current} ref={acceptedRef} className={styles.spinRotor} style={rotorStyle} /></div>
          <DiscCorners />
        </div>

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
          <div className={styles.physicalDisplay} data-deck-display-mirror role={controls ? "group" : undefined} aria-label={controls ? "Pantalla del equipo" : undefined}>
            <div className={styles.displayGlass} aria-hidden="true" />
            <strong>{displayTitle ?? (pose === "wait" ? "CDVICIOUS" : albumName)}</strong>
            <div className={styles.displayDetails}>
              {artistText && <span className={styles.displayArtist}>{artistText}</span>}
              <span className={styles.displayStatus}>{statusText ?? (pose === "wait" ? "INSERT DISC" : pose === "open" ? "CARGA ABIERTA" : "CD EN POSICIÓN")}</span>
            </div>
            <div className={styles.displayProgress}><ProgressBar progressMs={progressMs} durationMs={durationMs} isPlaying={isPlaying} /></div>
          </div>
          {controls ? <div className={styles.fixedTransport} inert={!controlsActive}>
            <button type="button" disabled={!controls.canControl || controls.transportPending || controls.blocked} aria-label="Pista anterior del equipo" onClick={controls.previous}>|◄◄</button>
            <button type="button" disabled={!controls.canControl || controls.transportPending || controls.blocked} aria-label="Pausar/reanudar equipo" aria-pressed={isPlaying} onClick={controls.toggle}>{isPlaying ? "❚❚" : "►"}</button>
            <button type="button" disabled={!controls.canControl || controls.transportPending || controls.blocked} aria-label="Pista siguiente del equipo" onClick={controls.next}>►►|</button>
          </div> : <div className={styles.fixedTransport}><i /><i /><b /><b /><i /></div>}
          <span className={styles.statusLamp} />
        </div>
        <span className={`${styles.foot} ${styles.footLeft}`} data-deck-surface /><span className={`${styles.foot} ${styles.footRight}`} data-deck-surface />
      </div>

      <div className={styles.airDisc} data-deck-air-disc style={{ visibility: pose === "open" && showDisc ? "visible" : "hidden" }} aria-hidden="true">
        <DiscFace albumName={albumName} artwork={artwork} />
        <DiscCorners />
      </div>
    </div>
    </div>
  </div>;
}
