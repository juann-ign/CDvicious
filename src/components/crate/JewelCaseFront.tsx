"use client";

import Image from "next/image";
import type { AlbumItem } from "@/types/crate";
import styles from "./JewelCaseFront.module.css";
import { collectionYear } from "@/lib/collectionFilters";

interface JewelCaseFrontProps {
  album: AlbumItem;
  onSelect: (originEl: HTMLElement) => void;
  reduceEffects?: boolean;
  presentation?: "default" | "collection";
}

export function JewelCaseFront({
  album,
  onSelect,
  reduceEffects = false,
  presentation = "default",
}: JewelCaseFrontProps) {
  const year = collectionYear(album.release_date);
  const edition = year === "unknown" ? "Sin fecha" : year;
  const artist = album.artists.map((item) => item.name).join(", ");
  return (
    <button
      type="button"
      className={[styles.case, reduceEffects ? styles.caseReduced : "", presentation === "collection" ? styles.collectionCase : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => onSelect(e.currentTarget)}
      aria-label={`${album.artists.map((a) => a.name).join(", ")} — ${album.name}`}
      data-collection-album-id={presentation === "collection" ? album.id : undefined}
    >
      <span className={styles.caseFace}>
      <span className={styles.cover}>
        {album.images[0]?.url && (
          <Image src={album.images[0].url} alt="" fill sizes="140px" unoptimized className={styles.art} />
        )}
      </span>
      <span className={styles.edge} />
      <span className={styles.gloss} />
      </span>
      {presentation === "collection" && <span className={styles.details}>
        <strong title={album.name}>{album.name}</strong>
        <span title={artist}>{artist}</span>
        <small title={`${edition}${album.genres?.length ? ` · Géneros del artista: ${album.genres.join(", ")}` : ""}`}>{edition}{album.genres?.[0] ? ` · ${album.genres[0]} (artista)` : ""}</small>
      </span>}
    </button>
  );
}
