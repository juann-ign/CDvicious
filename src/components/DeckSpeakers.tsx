"use client";

import { useRef } from "react";
import { useSpeakerExcursion } from "@/hooks/useSpeakerExcursion";
import type { SimulatedAudioClockRef } from "@/hooks/useSimulatedAudioClock";
import styles from "./DeckSpeakers.module.css";

interface DeckSpeakersProps {
  playing: boolean;
  active: boolean;
  visible: boolean;
  trackKey?: string;
  clock: SimulatedAudioClockRef;
  volume?: number | null;
}

type Driver = "woofer-upper" | "tweeter" | "woofer-lower";

function GrillePanel({ driver }: { driver: Driver }) {
  return <div className={styles.panel} data-speaker-panel={driver}>
    <div className={styles.driver}>
      <div className={styles.surround} />
      <div className={styles.diaphragm} data-speaker-cone={driver}>
        <div className={styles.dustCap} data-speaker-dust-cap={driver} />
      </div>
    </div>
    <div className={styles.mesh} />
  </div>;
}

function SpeakerCabinet({ side }: { side: "left" | "right" }) {
  return <div className={styles.speaker} data-speaker-side={side}>
    <div className={styles.floorShadow} />
    <div className={styles.sidePlane} />
    <div className={styles.topPlane} />
    <div className={styles.frontPlane}>
      <GrillePanel driver="woofer-upper" />
      <GrillePanel driver="tweeter" />
      <GrillePanel driver="woofer-lower" />
    </div>
  </div>;
}

/** Decorative speakers share playback time, not control or audio ownership. */
export function DeckSpeakers({ playing, active, visible, trackKey, clock, volume }: DeckSpeakersProps) {
  const root = useRef<HTMLDivElement>(null);
  useSpeakerExcursion(root, { clock, trackKey, isPlaying: playing, active: active && visible, volume });

  return <div ref={root} className={styles.speakers} aria-hidden="true"
    data-deck-speakers data-speakers-visible={visible}>
    <div className={styles.pair}>
      <SpeakerCabinet side="left" />
      <SpeakerCabinet side="right" />
    </div>
  </div>;
}
