"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

export function PlaybackControls() {
  const { player, isReady } = useSpotifyPlayer();

  // Si el reproductor no está inicializado, no mostramos los controles
  if (!isReady || !player) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "16px",
        alignItems: "center",
        marginTop: "8px",
      }}
    >
      {/* Botón Prev */}
      <button
        onClick={() => player.previousTrack()}
        style={buttonStyle}
        aria-label="Previous Track"
      >
        ⏮
      </button>

      {/* Botón Play/Pause */}
      <button
        onClick={() => player.togglePlay()}
        style={{ ...buttonStyle, fontSize: "24px" }}
        aria-label="Play or Pause"
      >
        ⏯
      </button>

      {/* Botón Next */}
      <button
        onClick={() => player.nextTrack()}
        style={buttonStyle}
        aria-label="Next Track"
      >
        ⏭
      </button>
    </div>
  );
}

// Unos estilos básicos para que no se vea feo, adaptalos a tu globals.css después
const buttonStyle = {
  background: "transparent",
  border: "none",
  color: "#eceef0",
  fontSize: "20px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.8,
  transition: "opacity 0.2s",
};
