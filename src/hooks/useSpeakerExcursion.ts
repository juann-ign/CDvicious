"use client";

import { useEffect, useRef, type RefObject } from "react";
import { simulatedPlaybackSeconds, simulatedPulse, speakerExcursion } from "@/lib/simulatedAudio";
import type { SimulatedAudioClockRef } from "./useSimulatedAudioClock";

interface SpeakerExcursionOptions {
  clock: SimulatedAudioClockRef;
  trackKey?: string;
  isPlaying: boolean;
  active: boolean;
  volume?: number | null;
}

export function useSpeakerExcursion(rootRef: RefObject<HTMLElement | null>, options: SpeakerExcursionOptions) {
  const latest = useRef(options);
  latest.current = options;
  const refreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = rootRef.current;
    if (!container) return;
    const root = container;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame: number | null = null;
    let lastTrack: string | undefined;
    let drawnLow = -1, drawnMid = -1;

    function draw(low: number, mid: number) {
      if (low !== drawnLow) { root.style.setProperty("--speaker-cone-low", String(low)); drawnLow = low; }
      if (mid !== drawnMid) { root.style.setProperty("--speaker-cone-mid", String(mid)); drawnMid = mid; }
    }

    function stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      draw(0, 0);
    }

    function playing() {
      const { active, isPlaying, trackKey, clock, volume } = latest.current;
      const muted = volume != null && Number.isFinite(volume) && volume <= 0;
      return active && isPlaying && Boolean(trackKey) && clock.current.trackKey === trackKey && clock.current.playing && !muted && !document.hidden;
    }

    function refresh() {
      const track = latest.current.trackKey;
      if (lastTrack !== track) { lastTrack = track; draw(0, 0); }
      const canPlay = playing();
      const state = canPlay ? motion.matches ? "reduced" : "playing" : "idle";
      if (root.dataset.speakerMotion !== state) root.dataset.speakerMotion = state;
      if (!canPlay || motion.matches) { stop(); return; }
      if (frame === null) frame = requestAnimationFrame(tick);
    }

    function tick(now: number) {
      frame = null;
      if (playing() && !motion.matches) {
        const { clock, volume } = latest.current;
        const pulse = simulatedPulse(simulatedPlaybackSeconds(clock.current, now), clock.current.seed);
        const excursion = speakerExcursion(pulse, volume);
        draw(Math.round(excursion.low * 10000) / 10000, Math.round(excursion.mid * 10000) / 10000);
      }
      refresh();
    }

    root.dataset.speakerSignal = "simulated";
    refreshRef.current = refresh;
    document.addEventListener("visibilitychange", refresh);
    motion.addEventListener("change", refresh);
    refresh();
    return () => {
      stop();
      root.dataset.speakerMotion = "idle";
      refreshRef.current = null;
      document.removeEventListener("visibilitychange", refresh);
      motion.removeEventListener("change", refresh);
    };
  }, [rootRef]);

  const { active, isPlaying, trackKey, volume, clock } = options;
  useEffect(() => { refreshRef.current?.(); }, [active, isPlaying, trackKey, volume, clock]);
}
