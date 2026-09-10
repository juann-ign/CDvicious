"use client";

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useDominantColor } from "@/hooks/useDominantColor";
import styles from "./CollectionCrate.module.css";

export interface CollectionAlbum {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string }[];
  uri: string;
}

interface CollectionCrateProps {
  albums: CollectionAlbum[];
  totalCount?: number;
}

interface CollectionSpineProps {
  album: CollectionAlbum;
  index: number;
}

const DISPLAY_LIMIT = 30;

function CollectionSpine({ album, index }: CollectionSpineProps) {
  const coverUrl = album.images[0]?.url;
  const artist = album.artists.map((item) => item.name).join(", ");
  const accentColor = useDominantColor(coverUrl) ?? "#68717b";
  const rotation = ((index * 19) % 9) - 4;
  const depth = index * 3;
  const offset = index * 18;

  const spineStyle = {
    "--spine-accent": accentColor,
    "--spine-rotation": `${rotation}deg`,
    "--spine-depth": `${depth}px`,
    "--spine-offset": `${offset}px`,
  } as CSSProperties;

  return (
    <Link
      href={`/?album=${album.id}`}
      className={styles.spine}
      style={spineStyle}
      title={`${album.name} — ${artist}`}
      aria-label={`Play ${album.name} by ${artist}`}
    >
      <span className={styles.caseFace} aria-hidden="true">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            sizes="78px"
            className={styles.caseArtwork}
            unoptimized
          />
        ) : null}
      </span>
      <span className={styles.spineRail} aria-hidden="true" />
      <span className={styles.spineLabel}>
        <strong>{album.name}</strong>
        <small>{artist}</small>
      </span>
      <span className={styles.spineGloss} aria-hidden="true" />
    </Link>
  );
}

export function CollectionCrate({ albums, totalCount }: CollectionCrateProps) {
  const visibleAlbums = albums.slice(0, DISPLAY_LIMIT);
  const count = totalCount ?? albums.length;

  return (
    <section id="crate" className={styles.crate} aria-labelledby="collection-crate-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>ARCHIVE / MEDIA STORAGE</span>
          <h2 id="collection-crate-title" className={styles.title}>
            THE CRATE
          </h2>
        </div>
        <Link href="/crate" className={styles.openLink}>
          OPEN COLLECTION <span aria-hidden="true">↗</span>
        </Link>
      </div>

      <div className={styles.body}>
        <div className={styles.rail} aria-hidden="true" />
        <div
          className={styles.contents}
          aria-label={`${count} albums in collection`}
        >
          {visibleAlbums.map((album, index) => (
            <CollectionSpine album={album} index={index} key={album.id} />
          ))}
        </div>
        <div className={styles.rail} aria-hidden="true" />
      </div>

      <div className={styles.footer}>
        <span>{count} CDS IN ARCHIVE</span>
        <span className={styles.hint}>SELECT AN ALBUM OR OPEN THE FULL BATEA</span>
      </div>
    </section>
  );
}
