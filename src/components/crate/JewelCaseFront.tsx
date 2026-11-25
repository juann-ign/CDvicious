"use client";

import Image from "next/image";
import type { AlbumItem } from "@/types/crate";
import styles from "./JewelCaseFront.module.css";
import material from "./JewelCaseMaterial.module.css";
import { collectionYear } from "@/lib/collectionFilters";

interface JewelCaseFrontProps {
  album: AlbumItem;
  onSelect: (originEl: HTMLElement) => void;
  presentation?: "default" | "collection";
}

export function JewelCaseFront({
  album,
  onSelect,
  presentation = "default",
}: JewelCaseFrontProps) {
  const year = collectionYear(album.release_date);
  const edition = year === "unknown" ? "Sin fecha" : year;
  const artist = album.artists.map((item) => item.name).join(", ");
  const primaryGenre = album.genres?.[0];
  const genres = primaryGenre ? `Géneros del artista · ${album.genres?.join(", ")}` : undefined;
  return (
    <button
      type="button"
      className={`${styles.case} ${material.finish}${presentation === "collection" ? ` ${styles.collectionCase}` : ""}`}
      onClick={(e) => onSelect(e.currentTarget)}
      aria-label={`${artist} — ${album.name}`}
      aria-description={presentation === "collection" ? [edition, genres].filter(Boolean).join(". ") : undefined}
      data-collection-album-id={presentation === "collection" ? album.id : undefined}
    >
      <span className={`${styles.caseFace} ${material.face}`} data-jewel-material="shared">
        <span className={styles.cover}>
          {album.images[0]?.url && (
            <Image src={album.images[0].url} alt="" fill sizes="140px" unoptimized className={styles.art} />
          )}
          <span className={material.bookletMold} data-jewel-detail="booklet-mold" aria-hidden="true" />
        </span>
        <span className={`${styles.hinge} ${material.hinge}`} aria-hidden="true" />
        <span className={`${styles.edge} ${material.lid}`} aria-hidden="true" />
      </span>
      {presentation === "collection" && <span className={styles.details}>
        <strong title={album.name}>{album.name}</strong>
        <span className={styles.edition} title={artist ? `${artist} · ${edition}` : edition}>
          {artist && <><span className={styles.ellipsis}>{artist}</span><span className={styles.fixed} aria-hidden="true">·</span></>}
          <span className={`${styles.year} ${styles.fixed}`}>{edition}</span>
        </span>
        <small className={styles.genre} title={genres}>
          {primaryGenre && <><span className={styles.ellipsis}>{primaryGenre}</span><span className={styles.fixed}>(artista)</span></>}
        </small>
      </span>}
    </button>
  );
}
