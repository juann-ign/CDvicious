"use client";

import { useRef } from "react";
import styles from "./JewelSpine.module.css";

interface JewelSpineProps {
  title: string;
  artist: string;
  coverUrl: string;
  tilt: number;
  reduceEffects?: boolean;
  onSelect: () => void;
  onHover?: (rect: DOMRect | null) => void;
}

export function JewelSpine({
  title,
  artist,
  coverUrl,
  tilt,
  reduceEffects = false,
  onSelect,
  onHover,
}: JewelSpineProps) {
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      ref={ref}
      type="button"
      className={[styles.spine, reduceEffects ? styles.spineReduced : ""]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          "--tilt": `${tilt}deg`,
          "--cover": `url(${coverUrl})`,
        } as React.CSSProperties
      }
      onClick={onSelect}
      onPointerEnter={() => {
        if (!reduceEffects) {
          onHover?.(ref.current?.getBoundingClientRect() ?? null);
        }
      }}
      onPointerLeave={() => onHover?.(null)}
      onFocus={() => {
        if (!reduceEffects) {
          onHover?.(ref.current?.getBoundingClientRect() ?? null);
        }
      }}
      onBlur={() => onHover?.(null)}
      aria-label={`${artist} — ${title}`}
    >
      <span className={styles.case}>
        <span className={styles.cover} />
        <span className={styles.ghostDisc} />
        <span className={styles.labelScrim} />
        <span className={styles.label}>
          <span className={styles.labelText}>{artist}</span>
        </span>
        <span className={styles.gloss} />
        <span className={styles.edge} />
      </span>
    </button>
  );
}
