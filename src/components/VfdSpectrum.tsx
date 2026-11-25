"use client";

import { useEffect, useRef } from "react";
import styles from "./VfdSpectrum.module.css";

interface VfdSpectrumProps {
  trackKey: string;
  progressMs: number | null;
  isPlaying: boolean;
  active: boolean;
}

const BAND_COUNT = 12;
const SEGMENTS = 6;
const FRAME_MS = 1000 / 30;
const DECAY_MS = 320;
const PEAK_HOLD_MS = 450;
const PEAK_DECAY_MS = 420;
const BANDS = Array.from({ length: BAND_COUNT }, (_, index) => index);

function trackSeed(trackKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < trackKey.length; index++) {
    hash = Math.imul(hash ^ trackKey.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function simulatedPulse(seconds: number, seed: number) {
  const beat = seconds * (90 + seed % 37) / 60;
  const phase = (seed % 100) / 100 * 2 * Math.PI;
  const phrase = (1 + Math.sin(beat * Math.PI / 4 + phase)) / 2;
  const kick = Math.exp(-(beat % 1) * 8);
  const snare = Math.floor(beat) % 2 === 1 ? Math.exp(-(beat % 1) * 6) : 0;
  const hats = Math.exp(-(beat * 2 % 1) * 8);
  return {
    low: 0.26 + 0.17 * phrase + 0.51 * kick,
    middle: 0.22 + 0.17 * phrase + 0.16 * kick + 0.27 * snare,
    high: 0.10 + 0.10 * phrase + 0.27 * hats + 0.17 * snare,
    phase: beat * Math.PI / 3 + phase,
  };
}

function simulatedLevel(position: number, pulse: ReturnType<typeof simulatedPulse>) {
  // Nearby bands share an envelope, with a small wave across the display.
  const base = position <= 0.5
    ? pulse.low + (pulse.middle - pulse.low) * position * 2
    : pulse.middle + (pulse.high - pulse.middle) * (position - 0.5) * 2;
  const ripple = Math.sin(position * Math.PI * 4 + pulse.phase) * 0.10;
  return Math.max(0, Math.min(1, base + ripple));
}

export function VfdSpectrum({ trackKey, progressMs, isPlaying, active }: VfdSpectrumProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clock = useRef({ progress: 0, sampledAt: 0, playing: false });
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
    const seed = trackSeed(trackKey);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null;
    let lastDraw = 0;
    let reducedPlaying: boolean | null = null;

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
      const { playing, progress, sampledAt } = clock.current;
      const pulse = playing ? simulatedPulse((progress + Math.max(0, now - sampledAt)) / 1000, seed) : null;
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
      const { playing } = clock.current;
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
  }, [trackKey, active]);

  useEffect(() => {
    const progress = progressMs !== null && Number.isFinite(progressMs) ? Math.max(0, progressMs) : 0;
    clock.current = { progress, sampledAt: performance.now(), playing: isPlaying };
    refreshRef.current?.();
  }, [trackKey, progressMs, isPlaying, active]);

  return <div ref={rootRef} className={styles.spectrum} role="img" aria-label="Espectro simulado" data-vfd-spectrum>
    <div className={styles.bands} aria-hidden="true">
      {BANDS.map(band => <span key={band} className={styles.band} data-vfd-band>
        <span className={styles.fill} />
        <span className={styles.peak} />
      </span>)}
    </div>
  </div>;
}
