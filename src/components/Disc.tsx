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
  renderEnabled?: boolean;
}

export function Disc({
  track,
  isPlaying,
  accentColor,
  renderEnabled = true,
}: DiscProps) {
  const [isTrackRevealed, setIsTrackRevealed] = useState(true);
  const [isRailMoving, setIsRailMoving] = useState(false);
  const trackId = track?.id;

  // Keep motion-local rendering updates inside the Disc subtree. Subscribing
  // DeckPinnedLayer itself rerenders the pinned VFD, booklet and layout on each
  // rail handoff, which can stall the scroll animation.
  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    if (!railRoot) return;

    const syncMotionState = () => {
      setIsRailMoving(railRoot.dataset.railMoving === "true");
    };
    syncMotionState();

    const observer = new MutationObserver(syncMotionState);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-rail-moving"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!trackId) {
      setIsTrackRevealed(true);
      return;
    }

    setIsTrackRevealed(false);
    const frame = window.requestAnimationFrame(() => setIsTrackRevealed(true));

    return () => window.cancelAnimationFrame(frame);
  }, [trackId]);

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
      data-disc-render-enabled={renderEnabled ? "true" : "false"}
      data-disc-motion-active={isRailMoving ? "true" : "false"}
      data-has-track={track ? "true" : "false"}
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
          renderEnabled={renderEnabled}
          isRailMoving={isRailMoving}
        />
      </div>
    </div>
  );
}
