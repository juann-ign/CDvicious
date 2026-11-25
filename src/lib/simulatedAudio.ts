/** Shared visual simulation. The Spotify playback contract exposes no PCM. */
export interface SimulatedAudioClock {
  trackKey: string;
  seed: number;
  progress: number;
  sampledAt: number;
  playing: boolean;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function trackSeed(trackKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < trackKey.length; index++) {
    hash = Math.imul(hash ^ trackKey.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

export function simulatedAudioSnapshot(trackKey: string | null | undefined, progressMs: number | null, isPlaying: boolean, sampledAt: number): SimulatedAudioClock {
  const key = trackKey ?? "";
  return {
    trackKey: key,
    seed: trackSeed(key),
    progress: progressMs !== null && Number.isFinite(progressMs) ? Math.max(0, progressMs) : 0,
    sampledAt,
    playing: Boolean(key) && isPlaying,
  };
}

export function simulatedPlaybackSeconds(clock: SimulatedAudioClock, now: number) {
  return (clock.progress + (clock.playing ? Math.max(0, now - clock.sampledAt) : 0)) / 1000;
}

export function simulatedPulse(seconds: number, seed: number) {
  // Keep the spectrum's original tempo, phrase and band levels intact.
  const bpm = 90 + seed % 37;
  const beat = seconds * bpm / 60;
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
    phrase,
    sinceBeat: (beat % 1) * 60 / bpm,
    // Let the speakers breathe between strokes without slowing the VFD.
    sinceSpeakerBeat: (beat % 1.5) * 60 / bpm,
  };
}

function coneImpulse(age: number) {
  if (age <= 0 || age >= .43) return 0;
  // Ease into the outward stroke, then allow a small inward rebound.
  // A damped oscillator starting at rest gives a continuous peak without a snap.
  const attack = .048;
  if (age < attack) {
    const phase = age / attack;
    return phase * phase * (3 - 2 * phase);
  }
  const release = age - attack;
  const damping = 1 / .135;
  const omega = 2 * Math.PI / .235;
  const ringing = Math.exp(-release * damping) *
    (Math.cos(release * omega) + damping / omega * Math.sin(release * omega));
  const tail = clamp((.43 - age) / .12);
  return ringing * (ringing < 0 ? .55 : 1) * tail * tail * (3 - 2 * tail);
}

/** Signed, normalized visual displacement for the two drivers. The clock is
 * shared with the VFD; only the speaker rhythm is spaced farther apart. */
export function speakerExcursion(pulse: ReturnType<typeof simulatedPulse>, volume?: number | null) {
  const gain = volume == null || !Number.isFinite(volume) ? 0.72 : Math.sqrt(clamp(volume));
  return {
    low: gain * (0.80 + 0.20 * pulse.phrase) * coneImpulse(pulse.sinceSpeakerBeat),
    mid: gain * (0.70 + 0.16 * pulse.phrase) * coneImpulse(pulse.sinceSpeakerBeat - 0.012),
  };
}
