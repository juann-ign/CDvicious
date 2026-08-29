import type { SpotifyTrack } from "@/types/spotify";
import { PlaybackControls } from "./PlaybackControls";
import { ProgressBar } from "./ProgressBar";
import styles from "./NowPlayingCard.module.css";

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
    <div className={styles.chassis}>
      {/* DISPLAY VFD INCRUSTADO */}
      <div className={styles.vfdDisplay}>
        <div className={styles.vfdTrackName}>
          {track ? track.name : error ? "ERR: SIN SEÑAL" : "INSERT DISC"}
        </div>
        <div className={styles.vfdArtist}>
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
