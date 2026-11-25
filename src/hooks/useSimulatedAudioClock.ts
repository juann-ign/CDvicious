"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { simulatedAudioSnapshot, type SimulatedAudioClock } from "@/lib/simulatedAudio";

export type SimulatedAudioClockRef = RefObject<SimulatedAudioClock>;

/** One playback snapshot timestamp for the VFD and both speaker cabinets. */
export function useSimulatedAudioClock(trackKey: string | undefined, progressMs: number | null, isPlaying: boolean): SimulatedAudioClockRef {
  const clock = useRef(simulatedAudioSnapshot(undefined, 0, false, 0));
  useLayoutEffect(() => {
    clock.current = simulatedAudioSnapshot(trackKey, progressMs, isPlaying, performance.now());
  }, [trackKey, progressMs, isPlaying]);
  return clock;
}
