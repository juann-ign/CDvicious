import type { SpotifyTrack } from "@/types/spotify";
import { PlaybackControls } from "./PlaybackControls";
import { ProgressBar } from "./ProgressBar";
import styles from "./NowPlayingCard.module.css";

interface NowPlayingCardProps {
  global?: boolean;
  loading?: boolean;
  loadingAlbum?: string;
  track: SpotifyTrack | null;
  isPlaying: boolean;
  error: boolean;
  progressMs: number | null;
  durationMs: number | null;
}

export function NowPlayingCard({
  global = false,
  loading = false,
  loadingAlbum,
  track,
  isPlaying,
  error,
  progressMs,
  durationMs,
}: NowPlayingCardProps) {
  return (
    <div className={`${styles.chassis} ${global ? styles.globalChassis : ""}`} data-player-faceplate>
      <div className={styles.front} data-hardware-front="player">
        <div className={styles.vfdDisplay} data-testid="deck-now-playing" data-is-playing={!loading && isPlaying ? "true" : "false"} data-playback-state={loading ? "loading" : "settled"}>
          <div className={styles.vfdTrackName} data-testid="deck-now-playing-track" title={loading ? loadingAlbum : track?.name}>
            {loading ? "CARGANDO" : track ? track.name : error ? "ERR: SIN SEÑAL" : "INSERT DISC"}
          </div>

          <div className={styles.vfdArtist} data-testid="deck-now-playing-artist" title={track?.artists.map((a) => a.name).join(" // ")}>
            {loading ? loadingAlbum ?? "ESPERANDO CONFIRMACIÓN" : track ? track.artists.map((a) => a.name).join(" // ") : "---"}
          </div>

          <ProgressBar
            progressMs={progressMs}
            durationMs={durationMs ?? 0}
            isPlaying={isPlaying}
          />
        </div>

        <PlaybackControls isPlaying={isPlaying} />
      </div>
    </div>
  );
}
