"use client";

import { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";
import styles from "./NowPlayingCard.module.css";

interface PlaybackControlsProps { isPlaying: boolean }

export function PlaybackControls({ isPlaying }: PlaybackControlsProps) {
  const controls = useCanonicalPlayerControls();
  const canControl = controls.canControl && !controls.blocked && !controls.transportPending;
  const canSetVolume = controls.volumeAvailable && !controls.blocked && !controls.volumeLoading;
  const activeVolumeBlocks = Math.round((controls.volume ?? 0) * 10);
  const isMuted = controls.volume === 0;
  const notice = controls.blocked ? "CARGANDO" : controls.transportError ?? controls.volumeError ?? (controls.volumeLoading ? "Consultando volumen…" : null);
  return <div className={styles.transportGroup} data-canonical-transport data-lenis-prevent data-volume-device={controls.deviceId ?? ""} data-volume-pending={controls.volumePending}>
    <div className={styles.buttonsWrapper} role="group" aria-label="Transporte de reproducción">
      <span className={styles.controlLegend} aria-hidden="true">TRANSPORTE</span>
      <button type="button" className={styles.hwBtn} disabled={!canControl} onClick={() => void controls.previous()} aria-label="Previous">|◄◄</button>
      <button type="button" className={`${styles.hwBtn} ${styles.hwBtnPlay} ${isPlaying ? styles.isActive : ""}`} disabled={!canControl} onClick={() => void controls.toggle()} aria-label="Play/Pause">{isPlaying ? "❚❚" : "►"}</button>
      <button type="button" className={styles.hwBtn} disabled={!canControl} onClick={() => void controls.next()} aria-label="Next">►►|</button>
    </div>
    <div className={styles.faderWrapper} role="group" aria-label="Volumen de reproducción">
      <span className={styles.controlLegend} aria-hidden="true">NIVEL</span>
      <button type="button" disabled={!canSetVolume} aria-label="Silenciar volumen" aria-pressed={isMuted} onClick={controls.toggleMute} className={`${styles.muteLabel} ${isMuted ? styles.muteLabelActive : ""}`} title="Silenciar / restaurar volumen">{isMuted ? "MUT" : "VOL"}</button>
      <div className={styles.faderTrack}>
        <div className={styles.faderTrackInner}>{Array.from({ length: 10 }, (_, i) => <div key={i} className={`${styles.faderBlock} ${i < activeVolumeBlocks ? styles.faderBlockActive : ""}`} />)}</div>
        <input type="range" min="0" max="1" step="0.01" value={controls.volume ?? 0} disabled={!canSetVolume} aria-label="Volumen del transporte" aria-valuetext={controls.volume === null ? "Volumen sin lectura disponible" : `${Math.round(controls.volume * 100)}%`} onChange={event => controls.setVolume(Number(event.target.value))} className={styles.faderInput} title={controls.volume === null ? "Volumen no disponible" : `Volumen: ${Math.round(controls.volume * 100)}%`} />
      </div>
    </div>
    {notice && <span className={styles.transportNotice} role={controls.transportError || controls.volumeError ? "alert" : "status"} title={notice}>{notice}</span>}
    {controls.volumeError && !controls.blocked && <button className={styles.volumeRetry} type="button" onClick={() => void controls.refreshVolume()} aria-label="Reintentar volumen del transporte">↻</button>}
  </div>;
}
