"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";

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
  const glowStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <div className="disc-stage">
      <div
        className={`disc-glow ${isPlaying ? "is-active" : ""}`}
        style={glowStyle}
      />
      <div className="disc">
        <DiscCanvas
          track={track}
          isPlaying={isPlaying}
          accentColor={accentColor}
        />
      </div>
    </div>
  );
}
