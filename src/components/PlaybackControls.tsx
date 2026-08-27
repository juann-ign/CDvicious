"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useState } from "react";

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
    <div
      style={{
        display: "flex",
        width: "100%",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 4px",
      }}
    >
      {/* Grupo de Transporte Cuadrado */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          className="hw-btn"
          onClick={() => player.previousTrack()}
          aria-label="Previous"
        >
          |◄◄
        </button>

        <button
          className={`hw-btn hw-btn--play ${isPlaying ? "is-active" : ""}`}
          onClick={() => player.togglePlay()}
          aria-label="Play/Pause"
        >
          {isPlaying ? "❚❚" : "►"}
        </button>

        <button
          className="hw-btn"
          onClick={() => player.nextTrack()}
          aria-label="Next"
        >
          ►►|
        </button>
      </div>

      {/* Control de Volumen con Puntero Normal y Grab al Sostener */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <span
            onClick={handleToggleMute}
            style={{
              fontSize: "10px",
              color: isMuted ? "#ff3333" : "#4f554f",
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
        </div>

        {/* Contenedor Físico del Fader (Cursor por defecto por fuera) */}
        <div
          onClick={handleTrackClick}
          style={{
            position: "relative",
            width: "110px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            background: "#0c0e11",
            padding: "2px 5px",
            borderRadius: "3px",
            border: "1px solid #000",
            borderTop: "1px solid #2a2e35",
            cursor: "default", // <--- Puntero normal del sistema (flecha)
          }}
        >
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
            {Array.from({ length: totalVolumeBlocks }).map((_, i) => {
              const isActive = i < activeVolumeBlocks;
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: "100%",
                    backgroundColor: isActive ? "#39ff14" : "#122415",
                    boxShadow: isActive
                      ? "0 0 4px rgba(57, 255, 20, 0.6)"
                      : "none",
                    borderRadius: "1px",
                    transition: "background-color 0.05s ease",
                  }}
                />
              );
            })}
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
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              width: "100%",
              height: "100%",
              cursor: "default", // <--- Puntero de mano abierta en reposo
              zIndex: 3,
            }}
            className="volume-slider-input"
            title={`Volumen: ${Math.round(volumeLevel * 100)}%`}
          />
        </div>
      </div>

      <style jsx>{`
        .volume-slider-input:active {
          cursor: grabbing !important; /* <--- Puntero de mano cerrada al hacer hold */
        }

        .hw-btn {
          width: 44px;
          height: 32px;
          background: #111418;
          border: 1px solid #000;
          border-top: 1px solid #2a2e35;
          border-radius: 3px;
          color: #1b401e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.6);
          cursor: pointer;
          transition: all 0.1s;
          font-family: monospace;
        }
        .hw-btn--play {
          width: 56px;
        }
        .hw-btn:active,
        .hw-btn.is-active {
          background: #080a0c;
          border-top: 1px solid #111418;
          color: #39ff14;
          text-shadow: 0 0 8px rgba(57, 255, 20, 0.8);
          transform: translateY(2px);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        }
      `}</style>
    </div>
  );
}
