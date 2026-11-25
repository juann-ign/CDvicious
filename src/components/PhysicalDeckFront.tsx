"use client";

import type { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";
import type { SimulatedAudioClockRef } from "@/hooks/useSimulatedAudioClock";
import { ProgressBar } from "./ProgressBar";
import { VfdSpectrum } from "./VfdSpectrum";
import styles from "./PhysicalDeckFront.module.css";

export interface PhysicalDeckFrontProps {
  title?: string;
  artist?: string;
  status?: string;
  progressMs?: number | null;
  durationMs?: number | null;
  isPlaying?: boolean;
  controls?: ReturnType<typeof useCanonicalPlayerControls>;
  controlsActive?: boolean;
  pose: "wait" | "open" | "docked";
  loading?: boolean;
  trackId?: string;
  simulationClock: SimulatedAudioClockRef;
}

function TransportIcon({ direction }: { direction: "previous" | "next" }) {
  return <svg viewBox="0 0 32 20" aria-hidden="true" focusable="false">
    {direction === "previous" ? <path d="M4 3h3v14H4zM19 3v14L9 10zm11 0v14L20 10z" />
      : <path d="M25 3h3v14h-3zM13 3v14l10-7zM2 3v14l10-7z" />}
  </svg>;
}

/** Faceplate content only: the caller retains the approved physical surface,
 * knob and canonical playback state. All coordinates inherit its --u density. */
export function PhysicalDeckFront({ title, artist, status, progressMs = null, durationMs = null, isPlaying = false, controls, controlsActive = true, pose, loading = false, trackId, simulationClock }: PhysicalDeckFrontProps) {
  const displayTitle = title?.trim() || (pose === "wait" ? "CDVICIOUS" : "COMPACT DISC");
  const pending = Boolean(controls?.transportPending);
  const reported = status?.trim() ?? "";
  const error = controls?.transportError || (/ERROR|SIN SEÑAL/i.test(reported) ? reported : null);
  const state = loading ? "loading" : error ? "error" : pose === "wait" ? "wait" : isPlaying ? "playing" : "paused";
  const badge = loading ? null : error ? "ERROR" : pending ? "ESPERE" : pose === "wait" ? "ESPERA" : !isPlaying ? "PAUSA" : null;
  const secondary = loading ? reported || artist : artist || (reported && !/^REPRODUCIENDO$/i.test(reported) ? reported : pose === "wait" ? "INSERT DISC" : "");
  const disabled = !controlsActive || !controls?.canControl || pending || Boolean(controls?.blocked);

  return <div className={styles.front} data-physical-deck-front-content data-front-state={state}>
    <div className={styles.display} data-deck-display-mirror role="group" aria-label="Pantalla del equipo" aria-busy={loading || pending}>
      <span className={styles.glass} aria-hidden="true" />
      <div className={styles.metadata}>
        <strong className={styles.title} title={displayTitle}>{displayTitle}</strong>
        <div className={styles.byline}>
          <span className={styles.artist} title={secondary || undefined}>{secondary}</span>
          {badge && <span className={styles.status} role="status" title={error || undefined}>{badge}</span>}
        </div>
      </div>
      {trackId && (
        <VfdSpectrum trackKey={trackId} progressMs={progressMs}
          isPlaying={state === "playing"} active={controlsActive} clock={simulationClock} />
      )}
      {!loading && durationMs != null && (
        <div className={styles.progress}>
          <ProgressBar progressMs={progressMs} durationMs={durationMs} isPlaying={isPlaying} />
        </div>
      )}
    </div>

    <span className={styles.lamp} data-active={isPlaying && !loading} aria-hidden="true" />
    <div className={styles.transport} role="group" aria-label="Controles del equipo" aria-busy={pending} inert={!controlsActive}>
      <button type="button" disabled={disabled} aria-label="Pista anterior del equipo" onClick={controls?.previous}>
        <TransportIcon direction="previous" />
      </button>
      <button type="button" disabled={disabled} aria-label="Pausar/reanudar equipo" aria-pressed={isPlaying} onClick={controls?.toggle}>
        <svg viewBox="0 0 32 20" aria-hidden="true" focusable="false">
          {isPlaying ? <path d="M9 3h5v14H9zm9 0h5v14h-5z" /> : <path d="M11 2v16l14-8z" />}
        </svg>
      </button>
      <button type="button" disabled={disabled} aria-label="Pista siguiente del equipo" onClick={controls?.next}>
        <TransportIcon direction="next" />
      </button>
    </div>
  </div>;
}
