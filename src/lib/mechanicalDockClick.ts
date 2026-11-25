"use client";

export type MechanicalDockClickOutcome = "played" | "disabled" | "no-activation" | "hidden" | "unavailable" | "suspended" | "unsafe" | "cancelled";
const DEFAULT_ENABLED = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1";
const CLICK_SECONDS = 0.028;
let enabled = DEFAULT_ENABLED;
const listeners = new Set<() => void>();
const stops = new Set<() => void>();
export const getDockClickEnabled = () => enabled;
export const getServerDockClickEnabled = () => DEFAULT_ENABLED;
export function subscribeDockClickEnabled(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function setDockClickEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  if (!value) stops.forEach((stop) => stop());
  listeners.forEach((listener) => listener());
}

export interface ArmedMechanicalDockClick {
  play(options: { safeToPlay: boolean; signal: AbortSignal; volume: number }): Promise<MechanicalDockClickOutcome>;
  dispose(): void;
}

// This function must run in the trusted load gesture, before any SDK awaits.
// It never retries resume outside that gesture or forces autoplay permission.
export function armMechanicalDockClick(): ArmedMechanicalDockClick {
  let unavailable: MechanicalDockClickOutcome | null = null;
  let context: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let used = false;
  let disposed = false;
  let finishCurrent: ((outcome: MechanicalDockClickOutcome) => void) | null = null;
  const stop = () => finishCurrent?.("cancelled");
  const visible = () => typeof document !== "undefined" && document.visibilityState === "visible";
  if (!enabled) unavailable = "disabled";
  else if (!visible()) unavailable = "hidden";
  else if (typeof navigator === "undefined" || navigator.userActivation?.isActive !== true) unavailable = "no-activation";
  else {
    const Audio = typeof window === "undefined" ? undefined : window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) unavailable = "unavailable";
    else {
      try {
        context = new Audio();
        void context.resume().catch(() => undefined);
      } catch { unavailable = "unavailable"; }
    }
  }
  stops.add(stop);
  return {
    play({ safeToPlay, signal, volume }) {
      if (used || disposed || signal.aborted) return Promise.resolve("cancelled");
      used = true;
      if (!enabled) return Promise.resolve("disabled");
      if (!visible()) return Promise.resolve("hidden");
      if (!safeToPlay || !Number.isFinite(volume) || volume <= 0) return Promise.resolve("unsafe");
      if (unavailable) return Promise.resolve(unavailable);
      if (!context || context.state !== "running") return Promise.resolve("suspended");
      const audio = context;
      return new Promise((resolve) => {
        let timer = 0;
        let done = false;
        const finish = (outcome: MechanicalDockClickOutcome) => {
          if (done) return;
          done = true;
          window.clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          document.removeEventListener("visibilitychange", hide);
          finishCurrent = null;
          if (source) {
            source.onended = null;
            try { source.stop(); } catch { /* already ended */ }
            source.disconnect();
          }
          gain?.disconnect();
          source = null; gain = null;
          resolve(outcome);
        };
        const abort = () => finish("cancelled");
        const hide = () => { if (!visible()) finish("hidden"); };
        finishCurrent = finish;
        signal.addEventListener("abort", abort, { once: true });
        document.addEventListener("visibilitychange", hide);
        try {
          const length = Math.max(1, Math.round(audio.sampleRate * CLICK_SECONDS));
          const buffer = audio.createBuffer(1, length, audio.sampleRate);
          const samples = buffer.getChannelData(0);
          // Original procedural percussion: short noise with a fast decay.
          let seed = 0x435644;
          for (let index = 0; index < length; index++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
            const progress = index / length;
            samples[index] = (seed / 2147483648) * Math.min(1, index / (audio.sampleRate * .001)) * Math.pow(1 - progress, 4);
          }
          source = audio.createBufferSource(); gain = audio.createGain();
          source.buffer = buffer;
          gain.gain.value = Math.min(.035, Math.max(0, volume) * .05);
          source.connect(gain); gain.connect(audio.destination);
          source.onended = () => finish("played");
          source.start(audio.currentTime);
          source.stop(audio.currentTime + CLICK_SECONDS);
          // A suspended/hidden device must not leave audio or loading pending.
          timer = window.setTimeout(() => finish(audio.state === "running" ? "played" : "suspended"), 45);
          if (signal.aborted) finish("cancelled");
        } catch { finish("unavailable"); }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop(); stops.delete(stop);
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
      context = null;
    },
  };
}
