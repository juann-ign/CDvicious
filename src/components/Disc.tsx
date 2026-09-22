"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { discRegistry } from "@/lib/discRegistry";
import styles from "./Disc/Disc.module.css";

const DiscCanvas = dynamic(
  () => import("./three/DiscCanvas").then((m) => m.DiscCanvas),
  { ssr: false },
);

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function Disc({ track, isPlaying, accentColor }: DiscProps) {
  const [isTrackRevealed, setIsTrackRevealed] = useState(true);

  useEffect(() => {
    if (!track) {
      setIsTrackRevealed(true);
      return;
    }

    setIsTrackRevealed(false);
    const frame = window.requestAnimationFrame(() => setIsTrackRevealed(true));

    return () => window.cancelAnimationFrame(frame);
  }, [track?.id]);

  const glowStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <div
      className={[
        styles.discStage,
        track && !isTrackRevealed ? styles.discStageEntering : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={(el) => {
        discRegistry.discTarget = el;
      }}
    >
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
