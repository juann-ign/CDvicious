"use client";

import type { CSSProperties } from "react";
import styles from "./JewelSpine.module.css";

interface JewelSpineProps {
  albumId: string;
  title: string;
  artist: string;
  coverUrl: string;
  tilt: number;
  presentation?: "classic" | "refined";
  onSelect: (origin: HTMLButtonElement) => void;
  onHover?: (rect: DOMRect | null, anchor?: HTMLButtonElement) => void;
}

const DEMO_INKS = [
  ["#377f96", "#382c50"], ["#b88745", "#5a352f"], ["#787b9c", "#304c6c"],
  ["#957071", "#503744"], ["#658665", "#254c37"], ["#a85d55", "#452d49"],
  ["#97894d", "#414e68"], ["#598989", "#324051"],
];

export function JewelSpine({
  albumId,
  title,
  artist,
  coverUrl,
  tilt,
  presentation = "classic",
  onSelect,
  onHover,
}: JewelSpineProps) {
  const numberedCover = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1"
    ? coverUrl.match(/^\/images\/mock-albums\/(\d{2})\.png$/) : null;
  const ink = numberedCover ? DEMO_INKS[(Number(numberedCover[1]) - 1) % DEMO_INKS.length] : null;

  return (
    <button
      type="button"
      className={presentation === "refined" ? `${styles.spine} ${styles.refined}` : styles.spine}
      data-case-presentation={presentation}
      style={{
        "--tilt": `${tilt}deg`,
        "--cover": coverUrl ? `url(${JSON.stringify(coverUrl)})` : "none",
        "--demo-ink": ink ? `linear-gradient(145deg, ${ink[0]}c9, ${ink[1]}a6)` : undefined,
      } as CSSProperties}
      onClick={(event) => onSelect(event.currentTarget)}
      onPointerEnter={(event) => onHover?.(event.currentTarget.getBoundingClientRect(), event.currentTarget)}
      onPointerLeave={() => onHover?.(null)}
      onFocus={(event) => onHover?.(event.currentTarget.getBoundingClientRect(), event.currentTarget)}
      onBlur={() => onHover?.(null)}
      aria-label={`${artist} — ${title}`}
      title={title}
      data-batea-album-id={albumId}
    >
      <span className={styles.case} aria-hidden="true">
        <span className={styles.rear} />
        <span className={styles.front}>
          <span className={styles.cover} />
          <span className={styles.hinge} />
        </span>
        <span className={styles.spineFace} />
        <span className={styles.topRim} />
        {presentation === "refined" && <><span className={styles.outerRim} /><span className={styles.bottomRim} /></>}
      </span>
    </button>
  );
}
