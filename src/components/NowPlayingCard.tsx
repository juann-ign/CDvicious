import type { SpotifyTrack } from "@/types/spotify";
import { PlaybackControls } from "./PlaybackControls";
import { ProgressBar } from "./ProgressBar";
import styles from "./NowPlayingCard.module.css";

interface NowPlayingCardProps {
  global?: boolean;
  track: SpotifyTrack | null;
  isPlaying: boolean;
  error: boolean;
  progressMs: number | null;
  durationMs: number | null;
}

export function NowPlayingCard({
  global = false,
  track,
  isPlaying,
  error,
  progressMs,
  durationMs,
}: NowPlayingCardProps) {
  return (
    // EL CHASIS DEL EQUIPO (Faceplate de metal oscuro/plástico mate)
    <div className={`${styles.chassis} ${global ? styles.globalChassis : ""}`}>
      {/* DISPLAY VFD INCRUSTADO */}
      <div className={styles.vfdDisplay} data-testid="deck-now-playing" data-is-playing={isPlaying ? "true" : "false"}>
        <div className={styles.vfdTrackName} data-testid="deck-now-playing-track" title={track?.name}>
          {track ? track.name : error ? "ERR: SIN SEÑAL" : "INSERT DISC"}
        </div>

        <div className={styles.vfdArtist} data-testid="deck-now-playing-artist" title={track?.artists.map((a) => a.name).join(" // ")}>
          {track ? track.artists.map((a) => a.name).join(" // ") : "---"}
        </div>

        {(track || global) && (
          <ProgressBar
            progressMs={progressMs}
            durationMs={global ? durationMs ?? 0 : durationMs}
            isPlaying={isPlaying}
          />
        )}
      </div>

      {/* BOTONES FÍSICOS */}
      <PlaybackControls isPlaying={isPlaying} />
    </div>
  );
}
