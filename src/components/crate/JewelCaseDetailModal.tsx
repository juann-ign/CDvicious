"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";
import densityStyles from "./JewelCaseDetailModal.density.module.css";
import motionStyles from "./JewelCaseDetailModal.motion.module.css";

const CASE_OPEN_DURATION_MS = 1000;

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

  const handleOpenCase = () => {
    if (!isCaseOpen) setIsCaseOpen(true);
  };

  const handleCaseKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenCase();
    }
  };

  const handleLoad = () => {
    if (!isCaseOpen) {
      setIsCaseOpen(true);
      window.setTimeout(() => {
        if (discRef.current) onLoad(discRef.current);
      }, CASE_OPEN_DURATION_MS);
      return;
    }
    if (discRef.current) onLoad(discRef.current);
  };

  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const totalDuration = tracks?.reduce((total, track) => total + track.duration_ms, 0) ?? 0;

  const leftTransform = isCaseOpen
    ? "perspective(1500px) rotateY(9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const rightTransform = isCaseOpen
    ? "perspective(1500px) rotateY(-9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const discTransform = isCaseOpen
    ? "translate(-50%, -50%) translateZ(10px) scale(1) rotate(-25deg)"
    : "translate(-50%, -50%) translateZ(-6px) scale(0.82) rotate(-8deg)";

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((a) => a.name).join(", ")}`}
    >
      <button
        type="button"
        className={styles.scrim}
        onClick={onClose}
        aria-label="Cerrar"
      />

      <div
        className={`${styles.sheet} ${polishStyles.modalPolish} ${isOpen ? styles.sheetOpen : ""}`}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>álbum / jewel case</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>
              {album.artists.map((a) => a.name).join(", ")}
              {album.release_date?.slice(0, 4)
                ? ` · ${album.release_date.slice(0, 4)}`
                : ""}
            </p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            cerrar <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className={styles.casePerspective}>
          <div className={styles.caseShell}>
            <section
              className={`${motionStyles.closedFace} ${isCaseOpen ? motionStyles.closedFaceOpen : ""}`}
              aria-label="Abrir caja de CD"
              aria-hidden={isCaseOpen}
              role="button"
              tabIndex={isCaseOpen ? -1 : 0}
              onClick={handleOpenCase}
              onKeyDown={handleCaseKeyDown}
            >
              <div className={motionStyles.closedFacePanel}>
                <div className={motionStyles.closedArtwork}>
                  {album.images[0]?.url && (
                    <Image
                      src={album.images[0].url}
                      alt={album.name}
                      fill
                      unoptimized
                      className={motionStyles.closedArtworkImage}
                    />
                  )}
                </div>
                <div className={motionStyles.closedAcrylic} aria-hidden="true">
                  <span className={`${motionStyles.closedClip} ${motionStyles.closedClipTopLeft}`} />
                  <span className={`${motionStyles.closedClip} ${motionStyles.closedClipTopRight}`} />
                  <span className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomLeft}`} />
                  <span className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomRight}`} />
                </div>
              </div>
            </section>

            <div
              className={`${motionStyles.caseSpread} ${isCaseOpen ? motionStyles.caseSpreadOpen : ""}`}
              aria-hidden={!isCaseOpen}
            >
              <section
                className={`${styles.leftLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: leftTransform }}
                aria-label="Portada y lista de canciones"
              >
                <div className={styles.paperbackPanel}>
                  <div className={styles.coverPanel}>
                    {album.images[0]?.url && (
                      <Image
                        src={album.images[0].url}
                        alt={album.name}
                        fill
                        unoptimized
                        className={styles.cover}
                      />
                    )}
                    <span className={styles.coverGlare} aria-hidden="true" />
                  </div>

                  <div className={styles.trackPanel}>
                    <ul
                      className={`${styles.tracklist} ${denseTracklist ? densityStyles.trackGridDense : ""}`}
                      style={
                        denseTracklist
                          ? ({ "--track-rows": trackRows } as CSSProperties)
                          : undefined
                      }
                    >
                      {loading && (
                        <li className={styles.trackRow}>LEYENDO TOC...</li>
                      )}
                      {!loading &&
                        tracks?.map((t, i) => (
                          <li key={`${t.name}-${i}`} className={styles.trackRow}>
                            <span className={styles.trackIndex}>
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span className={styles.trackName}>{t.name}</span>
                            <span className={styles.trackDuration}>
                              {fmt(t.duration_ms)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </section>

              <section
                className={`${styles.rightLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: rightTransform }}
                aria-label="Disco"
              >
                <div className={styles.tray}>
                  <div className={styles.trayTexture} aria-hidden="true" />
                  <div className={styles.trayClips} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div
                    ref={discRef}
                    className={`${styles.disc} ${motionStyles.motionDisc} ${isCaseOpen ? motionStyles.motionDiscOpen : ""}`}
                    style={{ transform: discTransform, opacity: isCaseOpen ? 1 : 0 }}
                  >
                    {album.images[0]?.url && (
                      <Image
                        src={album.images[0].url}
                        alt=""
                        fill
                        unoptimized
                        className={styles.discArt}
                      />
                    )}
                    <span className={styles.discSheen} aria-hidden="true" />
                    <span className={styles.discRing} aria-hidden="true" />
                    <span className={styles.discHub} aria-hidden="true" />
                    <span className={styles.discLabel}>
                      {album.artists[0]?.name || "CDVICIOUS"}
                    </span>
                  </div>
                </div>
              </section>
            </div>

            <div className={styles.hinge} aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className={styles.acrylicReflection} aria-hidden="true" />
          </div>
        </div>

        <footer className={`${styles.actions} ${polishStyles.vfdFooter}`}>
          <button
            type="button"
            className={polishStyles.vfdMainAction}
            onClick={handleLoad}
            aria-label={`Reproducir ${album.name}`}
          >
            <span className={polishStyles.vfdMainInfo}>
              <strong>{album.name}</strong>
              <small>{album.artists.map((a) => a.name).join(", ")}</small>
            </span>
            <span className={polishStyles.vfdMainHover}>REPRODUCIR CD</span>
          </button>

          <div className={polishStyles.hardwareControls}>
            <button
              type="button"
              className={`${polishStyles.hwBtn} ${polishStyles.hwBtnTray}`}
              onClick={onClose}
              aria-label="Dejar en batea"
            >
              DEJAR EN BATEA
            </button>
            <button
              type="button"
              className={`${polishStyles.hwBtn} ${polishStyles.hwBtnCase}`}
              onClick={() => setIsCaseOpen((open) => !open)}
              aria-expanded={isCaseOpen}
              aria-label={isCaseOpen ? "Cerrar caja" : "Abrir caja"}
            >
              {isCaseOpen ? "CERRAR CAJA" : "ABRIR CAJA"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
