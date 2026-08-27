"use client";

import { useEffect, useState } from "react";

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
    <div
      style={{
        marginTop: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* 1. Barra de Bloques Responsiva */}
      <div
        style={{ display: "flex", gap: "3px", width: "100%", height: "9px" }}
      >
        {Array.from({ length: totalBlocks }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              backgroundColor: i < filledCount ? "#39ff14" : "#101e12",
              boxShadow:
                i < filledCount ? "0 0 6px rgba(57, 255, 20, 0.7)" : "none",
              borderRadius: "1px",
            }}
          />
        ))}
      </div>

      {/* 2. Tiempos (Alineados a los bordes exactos) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#228b15",
          fontFamily: "monospace",
          letterSpacing: "1px",
        }}
      >
        <span>{formatTime(display)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
}
