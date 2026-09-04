"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { DiscCanvas } from "./three/DiscCanvas";
import styles from "./Disc/Disc.module.css";

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function Disc({ track, isPlaying, accentColor }: DiscProps) {
  const glowStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <div className={styles.discStage}>
      <div
        className={`${styles.discGlow} ${isPlaying ? styles.isActive : ""}`}
        style={glowStyle}
      />
      <div className={styles.disc}>
        <DiscCanvas
          track={track}
          isPlaying={isPlaying}
          accentColor={accentColor}
        />
      </div>
    </div>
  );
}
