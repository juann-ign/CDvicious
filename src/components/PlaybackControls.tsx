"use client";

import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useState } from "react";
import styles from "./NowPlayingCard.module.css";

interface PlaybackControlsProps {
  isPlaying: boolean;
}

export function PlaybackControls({ isPlaying }: PlaybackControlsProps) {
  const { player, isReady } = useSpotifyPlayer();
  const [volumeLevel, setVolumeLevel] = useState(0.5);
  const [previousVolume, setPreviousVolume] = useState(0.5);

  if (!isReady || !player) return null;

  const totalVolumeBlocks = 10;
  const activeVolumeBlocks = Math.round(volumeLevel * totalVolumeBlocks);
  const isMuted = volumeLevel === 0;

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
      <div className={styles.buttonsWrapper}>
        <button
          className={styles.hwBtn}
          onClick={() => player.previousTrack()}
          aria-label="Previous"
        >
          |◄◄
        </button>
        <button
          className={`${styles.hwBtn} ${styles.hwBtnPlay} ${isPlaying ? styles.isActive : ""}`}
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
      <div className={styles.faderWrapper}>
        <span
          onClick={handleToggleMute}
          className={`${styles.muteLabel} ${isMuted ? styles.muteLabelActive : ""}`}
          title="Clic para Silenciar / Restaurar"
        >
          {isMuted ? "MUT" : "VOL"}
        </span>
        <div onClick={handleTrackClick} className={styles.faderTrack}>
          <div className={styles.faderTrackInner}>
            {Array.from({ length: totalVolumeBlocks }).map((_, i) => (
              <div
                key={i}
                className={`${styles.faderBlock} ${i < activeVolumeBlocks ? styles.faderBlockActive : ""}`}
              />
            ))}
          </div>
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
