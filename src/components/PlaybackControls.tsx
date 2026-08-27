"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

interface PlaybackControlsProps {
  isPlaying: boolean;
}

export function PlaybackControls({ isPlaying }: PlaybackControlsProps) {
  const { player, isReady } = useSpotifyPlayer();

  if (!isReady || !player) return null;

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const volume = parseFloat(e.target.value);
    player.setVolume(volume);
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

      {/* Control de Volumen (Estilo Fader de consola) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "10px",
            color: "#4f554f",
            fontFamily: "monospace",
            letterSpacing: "1px",
          }}
        >
          VOL
        </span>
        <div
          style={{
            position: "relative",
            width: "60px",
            height: "14px",
            display: "flex",
            alignItems: "center",
          }}
        >
          {/* Groove/Riel del volumen */}
          <div
            style={{
              position: "absolute",
              width: "100%",
              height: "4px",
              background: "#0c0e11",
              borderTop: "1px solid #000",
              borderBottom: "1px solid #2a2e35",
              borderRadius: "2px",
            }}
          />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            defaultValue="0.5"
            onChange={handleVolumeChange}
            style={{
              position: "relative",
              zIndex: 2,
              accentColor: "#39ff14",
              cursor: "pointer",
              width: "100%",
              opacity: 0.8,
            }}
          />
        </div>
      </div>

      <style jsx>{`
        /* Botones Rectangulares Estilo Hardware Retro de Estudio */
        .hw-btn {
          width: 44px;
          height: 32px;
          background: #111418;
          border: 1px solid #000;
          border-top: 1px solid #2a2e35;
          border-radius: 3px; /* Apenas redondeado, casi cuadrado */
          color: #1b401e; /* Verde apagado (como un LED inactivo) */
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
        /* Estado activo (Play prendido, o click) */
        .hw-btn:active,
        .hw-btn.is-active {
          background: #080a0c;
          border-top: 1px solid #111418;
          color: #39ff14; /* NEÓN PRENDIDO */
          text-shadow: 0 0 8px rgba(57, 255, 20, 0.8);
          transform: translateY(2px); /* Se hunde la tecla */
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
        }
      `}</style>
    </div>
  );
}
