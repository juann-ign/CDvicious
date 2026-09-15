"use client";

import Image from "next/image";
import styles from "./JewelFlyout.module.css";

interface JewelFlyoutProps {
  title: string;
  artist: string;
  coverUrl: string;
  year?: string;
  rect: DOMRect;
}

export function JewelFlyout({ title, artist, coverUrl, year, rect }: JewelFlyoutProps) {
  const flip = rect.top < 220;
  const left = Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2));
  const top = flip ? rect.bottom + 14 : rect.top - 14;

  return (
    <div
      className={styles.flyout}
      style={{
        left,
        top,
        transform: flip ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
      aria-hidden="true"
    >
      {!flip && <span className={styles.stemDown} />}
      <div className={styles.card}>
        <div className={styles.art}>
          {coverUrl && (
            <Image src={coverUrl} alt="" fill sizes="64px" unoptimized className={styles.artImg} />
          )}
          <span className={styles.artGloss} />
        </div>
        <div className={styles.meta}>
          <p className={styles.artist}>{artist}</p>
          <p className={styles.title}>{title}</p>
          {year && <p className={styles.year}>{year}</p>}
        </div>
      </div>
      {flip && <span className={styles.stemUp} />}
    </div>
  );
}
