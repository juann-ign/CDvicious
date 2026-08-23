"use client";

import { useEffect, useState } from "react";

interface ProgressBarProps {
  progressMs: number | null;
  durationMs: number | null;
  isPlaying: boolean;
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

  const pct = Math.min(100, (display / durationMs) * 100);

  return (
    <div className="progress-bar">
      <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
