"use client";

import { useEffect, useState } from "react";
import styles from "./NowPlayingCard.module.css";

interface ProgressBarProps {
  progressMs: number | null;
  durationMs: number | null;
  isPlaying: boolean;
}

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function ProgressBar({
  progressMs,
  durationMs,
  isPlaying,
}: ProgressBarProps) {
  const [display, setDisplay] = useState(progressMs ?? 0);

  useEffect(() => {
    setDisplay(progressMs ?? 0);
  }, [progressMs]);

  useEffect(() => {
    if (!isPlaying || durationMs == null) return;
    const interval = setInterval(() => {
      setDisplay((prev) => Math.min(prev + 250, durationMs));
    }, 250);
    return () => clearInterval(interval);
  }, [isPlaying, durationMs]);

  if (durationMs == null) return null;

  const pct = Math.min(1, display / durationMs);
  const totalBlocks = 40; // Cantidad de segmentos VFD
  const filledCount = Math.floor(pct * totalBlocks);

  return (
    <div className={styles.progressContainer}>
      {/* 1. Barra de Bloques Responsiva */}
      <div className={styles.progressBlocks}>
        {Array.from({ length: totalBlocks }).map((_, i) => (
          <div
            key={i}
            className={`${styles.progressBlock} ${
              i < filledCount ? styles.progressBlockActive : ""
            }`}
          />
        ))}
      </div>

      {/* 2. Tiempos (Alineados a los bordes exactos) */}
      <div className={styles.progressTimes}>
        <span>{formatTime(display)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}
