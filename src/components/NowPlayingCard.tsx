import type { SpotifyTrack } from "@/types/spotify";
import { PlaybackControls } from "./PlaybackControls";

interface NowPlayingCardProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  error: boolean;
}

export function NowPlayingCard({
  track,
  isPlaying,
  error,
}: NowPlayingCardProps) {
  return (
    <div className="now-playing-card">
      <div
        className={`now-playing-card__status ${isPlaying ? "is-active" : ""}`}
      />

      <div className="now-playing-card__meta">
        <div className="now-playing-card__track">
          {track
            ? track.name
            : error
              ? "Error de conexión"
              : "Sin reproducción activa"}
        </div>
        <div className="now-playing-card__artist">
          {track
            ? track.artists.map((a) => a.name).join(", ")
            : "Conectá y dale play a algo"}
        </div>
      </div>

      {/* Controles renderizados acá, empujados a la derecha */}
      <div style={{ marginLeft: "auto" }}>
        <PlaybackControls />
      </div>
    </div>
  );
}
