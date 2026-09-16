"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "./AlbumPreviewModal.module.css";
import type { AlbumItem, AlbumTrack } from "@/types/crate";

function fmt(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface AlbumPreviewModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: () => void;
}

export function AlbumPreviewModal({
  album,
  onClose,
  onLoad,
}: AlbumPreviewModalProps) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/album/${album.id}/tracks`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTracks(data.tracks ?? []);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [album.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={album.name}
    >
      <button
        type="button"
        className={styles.scrim}
        onClick={onClose}
        aria-label="Cerrar"
      />

      <div className={styles.sheet}>
        <div className={styles.caseArt}>
          {album.images[0]?.url && (
            <Image
              src={album.images[0].url}
              alt={album.name}
              fill
              unoptimized
              className={styles.cover}
            />
          )}
          <span className={styles.glare} />
        </div>

        <div className={styles.meta}>
          <p className={styles.artist}>
            {album.artists.map((a) => a.name).join(", ")}
          </p>
          <h3 className={styles.title}>{album.name}</h3>

          <ul className={styles.tracklist}>
            {loading && <li className={styles.trackRow}>LEYENDO TOC...</li>}
            {!loading &&
              tracks?.slice(0, 8).map((t, i) => (
                <li key={i} className={styles.trackRow}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.trackName}>{t.name}</span>
                  <span>{fmt(t.duration_ms)}</span>
                </li>
              ))}
          </ul>

          <div className={styles.actions}>
            <button type="button" className={styles.loadBtn} onClick={onLoad}>
              CARGAR EN DECK ▲
            </button>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              DEJAR EN LA BATEA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
