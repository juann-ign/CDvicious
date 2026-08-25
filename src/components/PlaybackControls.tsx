"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

export function PlaybackControls() {
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
        gap: "12px",
        alignItems: "center",
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
        style={{ ...buttonStyle, fontSize: "22px" }}
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

      {/* Control de Volumen Integrado */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          marginLeft: "4px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            color: "#82848a",
            fontFamily: "monospace",
          }}
        >
          VOL
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          defaultValue="0.5"
          onChange={handleVolumeChange}
          style={{
            accentColor: "var(--accent-color, #1db954)",
            cursor: "pointer",
            width: "50px",
            height: "4px",
          }}
        />
      </div>
    </div>
  );
}

const buttonStyle = {
  background: "transparent",
  border: "none",
  color: "#eceef0",
  fontSize: "18px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.8,
  transition: "opacity 0.2s",
  padding: 0,
};
