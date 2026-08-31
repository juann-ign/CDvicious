import type { SpotifyTrack } from "@/types/spotify";
import { PlaybackControls } from "./PlaybackControls";
import { ProgressBar } from "./ProgressBar";

interface NowPlayingCardProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  error: boolean;
  progressMs: number | null;
  durationMs: number | null;
}

export function NowPlayingCard({
  track,
  isPlaying,
  error,
  progressMs,
  durationMs,
}: NowPlayingCardProps) {
  return (
    // EL CHASIS DEL EQUIPO (Faceplate de metal oscuro/plástico mate)
    <div
      style={{
        background: "linear-gradient(to bottom, #1d1f25, #15161a)",
        borderRadius: "12px",
        padding: "20px",
        border: "1px solid #2a2c35",
        borderTop: "1px solid #363945", // Luz arriba del chasis
        boxShadow:
          "0 20px 40px rgba(0,0,0,0.8), inset 0 2px 4px rgba(255,255,255,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        width: "420px", // Un poco más ancho para albergar los controles cómodos
      }}
    >
      {/* DISPLAY VFD INCRUSTADO */}
      <div
        style={{
          background: "#070c08",
          border: "2px inset #121f13",
          borderRadius: "6px",
          padding: "16px 20px",
          width: "100%",
          boxShadow:
            "inset 0 4px 10px rgba(0,0,0,0.9), 0 0 20px rgba(57, 255, 20, 0.1)",
          fontFamily: "monospace",
        }}
      >
        <div
          style={{
            fontSize: "14px",
            fontWeight: "bold",
            color: "#39ff14",
            textShadow: "0 0 8px rgba(57, 255, 20, 0.8)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textTransform: "uppercase",
          }}
        >
          {track ? track.name : error ? "ERR: SIN SEÑAL" : "INSERT DISC"}
        </div>

        <div
          style={{
            fontSize: "11px",
            color: "#228b15",
            marginTop: "6px",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {track ? track.artists.map((a) => a.name).join(" // ") : "---"}
        </div>

        {track && (
          <ProgressBar
            progressMs={progressMs}
            durationMs={durationMs}
            isPlaying={isPlaying}
          />
        )}
      </div>

      {/* BOTONES FÍSICOS */}
      <PlaybackControls isPlaying={isPlaying} />
    </div>
  );
}
