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
  const [isOpen, setIsOpen] = useState(false);
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
    const raf = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleLoad = () => {
    if (caseRef.current) onLoad(caseRef.current);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((a) => a.name).join(", ")}`}
    >
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Cerrar" />

      <div className={`${styles.sheet} ${isOpen ? styles.sheetOpen : ""}`}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ALBUM / JEWEL CASE</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>
              {album.artists.map((a) => a.name).join(", ")}
              {album.release_date?.slice(0, 4) ? ` · ${album.release_date.slice(0, 4)}` : ""}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            CERRAR ✕
          </button>
        </header>

        <div className={styles.casePerspective}>
          <div ref={caseRef} className={styles.caseShell}>
            <section className={styles.leftLeaf} aria-label="Portada y lista de canciones">
              <div className={styles.leftArt}>
                {album.images[0]?.url && (
                  <Image src={album.images[0].url} alt={album.name} fill unoptimized className={styles.cover} />
                )}
                <span className={styles.interiorGlare} />
                <span className={styles.leftEdge} />
              </div>

              <div className={styles.trackPanel}>
                <div className={styles.trackHeader}>
                  <span>TRACKLIST</span>
                  <span>{tracks?.length ?? 0} PISTAS</span>
                </div>
                <ul className={styles.tracklist}>
                  {loading && <li className={styles.trackRow}>LEYENDO TOC...</li>}
                  {!loading && tracks?.map((t, i) => (
                    <li key={`${t.name}-${i}`} className={styles.trackRow}>
                      <span className={styles.trackIndex}>{String(i + 1).padStart(2, "0")}</span>
                      <span className={styles.trackName}>{t.name}</span>
                      <span className={styles.trackDuration}>{fmt(t.duration_ms)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={styles.rightLeaf} aria-label="Disco">
              <div className={styles.tray}>
                <div className={styles.trayRings} />
                <div className={styles.hub}>
                  <span />
                </div>
                <div className={styles.disc}>
                  {album.images[0]?.url && (
                    <Image src={album.images[0].url} alt="" fill unoptimized className={styles.discArt} />
                  )}
                  <span className={styles.discSheen} />
                  <span className={styles.discHub} />
                  <span className={styles.discLabel}>{album.artists[0]?.name || "CDVICIOUS"}</span>
                </div>
              </div>
            </section>

            <div className={styles.centerHinge} aria-hidden="true" />
            <div className={styles.acrylicReflection} aria-hidden="true" />
          </div>
        </div>

        <footer className={styles.actions}>
          <button type="button" className={styles.playBtn} onClick={handleLoad}>
            <span className={styles.playIcon}>▶</span>
            <span>REPRODUCIR ÁLBUM</span>
          </button>
          <button type="button" className={styles.loadBtn} onClick={handleLoad}>
            CARGAR EN DECK ▲
          </button>
          <button type="button" className={styles.closeBtnBottom} onClick={onClose}>
            DEJAR EN LA BATEA
          </button>
        </footer>
      </div>
    </div>
  );
}
