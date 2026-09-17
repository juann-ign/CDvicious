"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";
import densityStyles from "./JewelCaseDetailModal.density.module.css";

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
  const [isCaseOpen, setIsCaseOpen] = useState(false);
  const discRef = useRef<HTMLDivElement>(null);

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
    setIsCaseOpen(true);
    if (discRef.current) onLoad(discRef.current);
  };

  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const totalDuration = tracks?.reduce((total, track) => total + track.duration_ms, 0) ?? 0;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((a) => a.name).join(", ")}`}
    >
      <button type="button" className={styles.scrim} onClick={onClose} aria-label="Cerrar" />

      <div className={`${styles.sheet} ${polishStyles.modalPolish} ${isOpen ? styles.sheetOpen : ""}`}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>álbum / jewel case</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>
              {album.artists.map((a) => a.name).join(", ")}
              {album.release_date?.slice(0, 4) ? ` · ${album.release_date.slice(0, 4)}` : ""}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            cerrar <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className={styles.casePerspective}>
          <div className={styles.caseShell}>
            <section className={styles.leftLeaf} aria-label="Portada y lista de canciones">
              <div className={styles.paperbackPanel}>
                <div className={styles.coverPanel}>
                  {album.images[0]?.url && (
                    <Image src={album.images[0].url} alt={album.name} fill unoptimized className={styles.cover} />
                  )}
                  <span className={styles.coverGlare} aria-hidden="true" />
                </div>

                <div className={styles.trackPanel}>
                  <ul
                    className={`${styles.tracklist} ${denseTracklist ? densityStyles.trackGridDense : ""}`}
                    style={denseTracklist ? ({ "--track-rows": trackRows } as React.CSSProperties) : undefined}
                  >
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
              </div>
            </section>

            <section className={styles.rightLeaf} aria-label="Disco">
              <div className={styles.tray}>
                <div className={styles.trayTexture} aria-hidden="true" />
                <div className={styles.trayClips} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <div ref={discRef} className={styles.disc}>
                  {album.images[0]?.url && (
                    <Image src={album.images[0].url} alt="" fill unoptimized className={styles.discArt} />
                  )}
                  <span className={styles.discSheen} aria-hidden="true" />
                  <span className={styles.discRing} aria-hidden="true" />
                  <span className={styles.discHub} aria-hidden="true" />
                  <span className={styles.discLabel}>{album.artists[0]?.name || "CDVICIOUS"}</span>
                </div>
              </div>
            </section>

            <div className={styles.hinge} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className={styles.acrylicReflection} aria-hidden="true" />
          </div>
        </div>

        <footer className={`${styles.actions} ${polishStyles.vfdFooter}`}>
          <div className={polishStyles.vfdStatus} aria-live="polite">
            <span className={polishStyles.vfdStatusTop}>
              {isCaseOpen ? "CASE OPEN / DISC READY" : "READY / CASE CLOSED"}
            </span>
            <strong>{album.name}</strong>
            <span className={polishStyles.vfdStatusMeta}>
              {tracks?.length ?? 0} TRK · {loading ? "--:--" : fmt(totalDuration)}
            </span>
          </div>

          <div className={polishStyles.hardwareControls}>
            <button type="button" className={polishStyles.hwBtn} onClick={handleLoad} aria-label="Reproducir álbum">
              PLAY
            </button>
            <button type="button" className={polishStyles.hwBtn} onClick={handleLoad} aria-label="Cargar en deck">
              LOAD ▲
            </button>
            <button
              type="button"
              className={`${polishStyles.hwBtn} ${isCaseOpen ? polishStyles.hwBtnActive : ""}`}
              onClick={() => setIsCaseOpen(true)}
              disabled={isCaseOpen}
              aria-label="Abrir caja"
            >
              OPEN
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
