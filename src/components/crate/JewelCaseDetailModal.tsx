"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import styles from "./JewelCaseDetailModal.module.css";

function fmt(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface JewelCaseDetailModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
}

export function JewelCaseDetailModal({ album, onClose, onLoad }: JewelCaseDetailModalProps) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const caseRef = useRef<HTMLDivElement>(null);

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
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={album.name}>
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Cerrar" />

      <div className={styles.sheet}>
        <div ref={caseRef} className={styles.caseBody}>
          <div className={styles.tray}>
            <div className={styles.trayHub} />
          </div>
          <div className={styles.caseArt}>
            {album.images[0]?.url && (
              <Image src={album.images[0].url} alt={album.name} fill unoptimized className={styles.cover} />
            )}
            <span className={styles.spineEdge} />
            <span className={styles.glare} />
          </div>
        </div>

        <div className={styles.meta}>
          <p className={styles.artist}>{album.artists.map((a) => a.name).join(", ")}</p>
          <h3 className={styles.title}>{album.name}</h3>
          {album.genres && album.genres.length > 0 && (
            <p className={styles.genres}>{album.genres.slice(0, 3).join(" · ")}</p>
          )}

          <ul className={styles.tracklist}>
            {loading && <li className={styles.trackRow}>LEYENDO TOC...</li>}
            {!loading &&
              tracks?.map((t, i) => (
                <li key={i} className={styles.trackRow}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className={styles.trackName}>{t.name}</span>
                  <span>{fmt(t.duration_ms)}</span>
                </li>
              ))}
          </ul>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.loadBtn}
              onClick={() => caseRef.current && onLoad(caseRef.current)}
            >
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
