"use client";

import { useEffect, useRef } from "react";
import { simulatedPlaybackSeconds, simulatedPulse } from "@/lib/simulatedAudio";
import type { SimulatedAudioClockRef } from "@/hooks/useSimulatedAudioClock";
import styles from "./VfdSpectrum.module.css";

interface VfdSpectrumProps {
  trackKey: string;
  progressMs: number | null;
  isPlaying: boolean;
  active: boolean;
  clock: SimulatedAudioClockRef;
}

const BAND_COUNT = 12;
const SEGMENTS = 6;
const FRAME_MS = 1000 / 30;
const DECAY_MS = 320;
const PEAK_HOLD_MS = 450;
const PEAK_DECAY_MS = 420;
const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index);

function simulatedLevel(position: number, pulse: ReturnType<typeof simulatedPulse>) {
  // Nearby bands share an envelope, with a small wave across the display.
  const base = position <= 0.5
    ? pulse.low + (pulse.middle - pulse.low) * position * 2
    : pulse.middle + (pulse.high - pulse.middle) * (position - 0.5) * 2;
  const ripple = Math.sin(position * Math.PI * 4 + pulse.phase) * 0.10;
  return Math.max(0, Math.min(1, base + ripple));
}

export function VfdSpectrum({ trackKey, progressMs, isPlaying, active, clock }: VfdSpectrumProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(isPlaying);
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;
    const root = container;
    const bands = Array.from(root.querySelectorAll<HTMLElement>("[data-vfd-band]"), (node, index) => ({
      node,
      position: index / (BAND_COUNT - 1),
      level: 0,
      peak: 0,
      heldUntil: 0,
      drawnLevel: -1,
      drawnPeak: -1,
    }));
    const seed = clock.current.seed;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null;
    let lastDraw = 0;
    let reducedPlaying: boolean | null = null;

    const playingTrack = () => playingRef.current && clock.current.playing && clock.current.trackKey === trackKey;

    function setMotion(state: "idle" | "reduced" | "playing" | "decaying") {
      if (root.dataset.motion !== state) root.dataset.motion = state;
    }

    function draw(band: (typeof bands)[number]) {
      const level = Math.round(band.level * SEGMENTS);
      const peak = Math.round(band.peak * SEGMENTS);
      if (band.drawnLevel !== level) {
        band.node.style.setProperty("--band-level", `${(level / SEGMENTS * 100).toFixed(2)}%`);
        band.drawnLevel = level;
      }
      if (band.drawnPeak !== peak) {
        band.node.style.setProperty("--band-peak", `${(peak / SEGMENTS * 100).toFixed(2)}%`);
        band.node.style.setProperty("--peak-opacity", peak > 0 ? "1" : "0");
        band.drawnPeak = peak;
      }
    }

    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    }

    function reset(staticPulse?: ReturnType<typeof simulatedPulse>) {
      for (const band of bands) {
        band.level = staticPulse ? simulatedLevel(band.position, staticPulse) : 0;
        band.peak = 0;
        band.heldUntil = 0;
        draw(band);
      }
    }

    function tick(now: number) {
      frame = null;
      const delta = now - lastDraw;
      if (delta < FRAME_MS - 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      lastDraw = now;
      const pulse = playingTrack() ? simulatedPulse(simulatedPlaybackSeconds(clock.current, now), seed) : null;
      for (const band of bands) {
        const target = pulse ? simulatedLevel(band.position, pulse) : 0;
        band.level = Math.max(target, band.level - delta / DECAY_MS);
        if (target >= band.peak && target > 0) {
          band.peak = target;
          band.heldUntil = now + PEAK_HOLD_MS;
        } else if (now >= band.heldUntil) {
          const elapsed = now - Math.max(now - delta, band.heldUntil);
          band.peak = Math.max(band.level, band.peak - elapsed / PEAK_DECAY_MS);
        }
        draw(band);
      }
      refresh();
    }

    function refresh() {
      if (!active || document.hidden) {
        stop();
        if (root.dataset.motion !== "idle") reset();
        setMotion("idle");
        return;
      }
      const playing = playingTrack();
      if (motion.matches) {
        stop();
        if (root.dataset.motion !== "reduced" || reducedPlaying !== playing) {
          reset(playing ? simulatedPulse(0.2, seed) : undefined);
          reducedPlaying = playing;
        }
        setMotion("reduced");
        return;
      }
      const decaying = bands.some(band => band.level > 0 || band.peak > 0);
      setMotion(playing ? "playing" : decaying ? "decaying" : "idle");
      if (frame === null && (playing || decaying)) frame = requestAnimationFrame(tick);
    }

    function onVisibilityOrMotion() {
      lastDraw = performance.now();
      refresh();
    }

    reset();
    lastDraw = performance.now();
    refreshRef.current = refresh;
    document.addEventListener("visibilitychange", onVisibilityOrMotion);
    motion.addEventListener("change", onVisibilityOrMotion);
    return () => {
      stop();
      refreshRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityOrMotion);
      motion.removeEventListener("change", onVisibilityOrMotion);
    };
  }, [trackKey, active, clock]);

  useEffect(() => {
    playingRef.current = isPlaying;
    refreshRef.current?.();
  }, [trackKey, progressMs, isPlaying, active, clock]);

  return <div ref={rootRef} className={styles.spectrum} role="img" aria-label="Espectro simulado" data-vfd-spectrum>
    <div className={styles.bands} aria-hidden="true">
      {BANDS.map(band => <span key={band} className={styles.band} data-vfd-band>
        <span className={styles.fill} />
        <span className={styles.peak} />
      </span>)}
    </div>
  </div>;
}
