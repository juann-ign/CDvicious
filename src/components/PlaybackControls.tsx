"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useState } from "react";
import styles from "./NowPlayingCard.module.css";

interface PlaybackControlsProps {
  isPlaying: boolean;
}

export function PlaybackControls({ isPlaying }: PlaybackControlsProps) {
  const { player, isReady } = useSpotifyPlayer();
  const [volumeLevel, setVolumeLevel] = useState(0.5); // 0 a 1
  const [previousVolume, setPreviousVolume] = useState(0.5); // Memoria para el Mute

  if (!isReady || !player) return null;

  const totalVolumeBlocks = 10; // 10 bloques (10% a 100%)
  const activeVolumeBlocks = Math.round(volumeLevel * totalVolumeBlocks);
  const isMuted = volumeLevel === 0;

  // Manejador para el botón de Mute independiente
  const handleToggleMute = () => {
    if (isMuted) {
      const restored = previousVolume > 0 ? previousVolume : 0.5;
      setVolumeLevel(restored);
      player.setVolume(restored);
    } else {
      setPreviousVolume(volumeLevel);
      setVolumeLevel(0);
      player.setVolume(0);
    }
  };

  // Manejador de clics precisos sobre la zona de bloques
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const ratio = Math.max(0, Math.min(1, clickX / width));

    const steppedRatio =
      Math.round(ratio * totalVolumeBlocks) / totalVolumeBlocks;

    setVolumeLevel(steppedRatio);
    player.setVolume(steppedRatio);
  };

  return (
    <div className={styles.transportGroup}>
      {/* Grupo de Transporte Cuadrado */}
      <div className={styles.buttonsWrapper}>
        <button
          className={styles.hwBtn}
          onClick={() => player.previousTrack()}
          aria-label="Previous"
        >
          |◄◄
        </button>
        <button
          className={`${styles.hwBtn} ${styles.hwBtnPlay} ${isPlaying ? styles.isAct : ""}`}
          onClick={() => player.togglePlay()}
          aria-label="Play/Pause"
        >
          {isPlaying ? "❚❚" : "►"}
        </button>

        <button
          className={styles.hwBtn}
          onClick={() => player.nextTrack()}
          aria-label="Next"
        >
          ►►|
        </button>
      </div>
      {/* Control de Volumen con Puntero Normal y Grab al Sostener */}
      <div className={styles.faderWrapper}>
        <span
          onClick={handleToggleMute}
          style={{
            fontSize: "10px",
            color: isMuted ? "#3a1f1f" : "#4f554f",
            fontFamily: "monospace",
            letterSpacing: "1px",
            cursor: "pointer",
            userSelect: "none",
            textShadow: isMuted ? "0 0 5px rgba(255, 51, 51, 0.6)" : "none",
          }}
          title="Clic para Silenciar / Restaurar"
        >
          {isMuted ? "MUT" : "VOL"}
        </span>

        {/* Contenedor Físico del Fader (Cursor por defecto por fuera) */}
        <div onClick={handleTrackClick} className={styles.faderTrack}>
          {/* Matriz de 10 Bloques Discretos */}
          <div
            style={{
              height: "12px",
              width: "100%",
              display: "flex",
              gap: "3px",
              alignItems: "center",
              pointerEvents: "none",
            }}
          >
            {Array.from({ length: totalVolumeBlocks }).map((_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: "100%",
                  backgroundColor:
                    i < activeVolumeBlocks ? "#39ff14" : "#122415",
                  boxShadow:
                    i < activeVolumeBlocks
                      ? "0 0 4px rgba(57, 255, 20, 0.6)"
                      : "none",
                }}
              />
            ))}
          </div>
          {/* Input Range con cursor grab (reposo) y grabbing (al hacer hold / click sostenido) */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volumeLevel}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setVolumeLevel(val);
              player.setVolume(val);
            }}
            className={styles.faderInput}
            title={`Volumen: ${Math.round(volumeLevel * 100)}%`}
          />
        </div>
      </div>
    </div>
  );
}
