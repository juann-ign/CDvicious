"use client";

import Image from "next/image";
import Link from "next/link";
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

const DISPLAY_LIMIT = 72;

export function CollectionCrate({ albums, totalCount }: CollectionCrateProps) {
  const visibleAlbums = albums.slice(0, DISPLAY_LIMIT);
  const count = totalCount ?? albums.length;

  return (
    <section className={styles.crate} aria-labelledby="collection-crate-title">
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
          {visibleAlbums.map((album) => {
            const coverUrl = album.images[0]?.url;
            const artist = album.artists.map((item) => item.name).join(", ");

            return (
              <Link
                href={`/?album=${album.id}`}
                className={styles.spine}
                key={album.id}
                title={`${album.name} — ${artist}`}
                aria-label={`Play ${album.name} by ${artist}`}
              >
                {coverUrl ? (
                  <Image
                    src={coverUrl}
                    alt=""
                    fill
                    sizes="34px"
                    className={styles.spineImage}
                    unoptimized
                  />
                ) : null}
                <span className={styles.spineLabel}>{album.name}</span>
              </Link>
            );
          })}
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
