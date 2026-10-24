"use client";

import Image from "next/image";
import type { AlbumItem } from "@/types/crate";
import styles from "./JewelCaseFront.module.css";

interface JewelCaseFrontProps {
  album: AlbumItem;
  onSelect: (originEl: HTMLElement) => void;
}

export function JewelCaseFront({ album, onSelect }: JewelCaseFrontProps) {
  return (
    <button
      type="button"
      className={styles.case}
      onClick={(e) => onSelect(e.currentTarget)}
      aria-label={`${album.artists.map((a) => a.name).join(", ")} — ${album.name}`}
    >
      <span className={styles.cover}>
        {album.images[0]?.url && (
          <Image src={album.images[0].url} alt="" fill sizes="140px" unoptimized className={styles.art} />
        )}
      </span>
      <span className={styles.edge} />
      <span className={styles.gloss} />
    </button>
  );
}
