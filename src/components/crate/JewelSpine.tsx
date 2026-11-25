"use client";

import { useRef, type CSSProperties } from "react";
import styles from "./JewelSpine.module.css";

interface JewelSpineProps {
  albumId: string;
  title: string;
  artist: string;
  coverUrl: string;
  tilt: number;
  onSelect: (origin: HTMLButtonElement) => void;
  onHover?: (rect: DOMRect | null) => void;
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
  onSelect,
  onHover,
}: JewelSpineProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const numberedCover = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1"
    ? coverUrl.match(/^\/images\/mock-albums\/(\d{2})\.png$/) : null;
  const ink = numberedCover ? DEMO_INKS[(Number(numberedCover[1]) - 1) % DEMO_INKS.length] : null;

  return (
    <button
      ref={ref}
      type="button"
      className={styles.spine}
      style={{
        "--tilt": `${tilt}deg`,
        "--cover": coverUrl ? `url(${JSON.stringify(coverUrl)})` : "none",
        "--demo-ink": ink ? `linear-gradient(145deg, ${ink[0]}c9, ${ink[1]}a6)` : undefined,
      } as CSSProperties}
      onClick={(event) => onSelect(event.currentTarget)}
      onPointerEnter={() => onHover?.(ref.current?.getBoundingClientRect() ?? null)}
      onPointerLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(ref.current?.getBoundingClientRect() ?? null)}
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
        <span className={styles.spineFace}>
          <span className={styles.labelText}>{title}</span>
        </span>
        <span className={styles.topRim} />
      </span>
    </button>
  );
}
