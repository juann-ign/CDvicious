"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import type { CSSProperties } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import { useDiscSurfaceDrag } from "@/hooks/useDiscSurfaceDrag";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";
import densityStyles from "./JewelCaseDetailModal.density.module.css";
import motionStyles from "./JewelCaseDetailModal.motion.module.css";

const CASE_CLOSE_START_MS = 240;
const CASE_CLOSE_MS = 620;
const POST_CLOSE_HOLD_MS = 160;
const EXIT_MS = 340;

function fmt(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface JewelCaseDetailModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
}

interface ReleaseMeta {
  year?: string;
  label?: string;
  catalogNumber?: string;
  format?: string;
  country?: string;
  tags?: string[];
}

export function JewelCaseDetailModal({
  album,
  onClose,
  onLoad,
}: JewelCaseDetailModalProps) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isCaseOpen, setIsCaseOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLifting, setIsLifting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [launchOrigin, setLaunchOrigin] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [releaseMeta, setReleaseMeta] = useState<ReleaseMeta>(() => ({
    year: album.release_date?.slice(0, 4),
    label: album.label,
    format: "COMPACT DISC",
    tags: album.genres ?? [],
  }));
  const discRef = useRef<HTMLDivElement>(null);
  const launchDiscRef = useRef<HTMLDivElement>(null);
  const launchSpinnerRef = useRef<HTMLDivElement>(null);
  const launchTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const handedOffRef = useRef(false);
  const {
    rotation: discDragRotation,
    isDragging: isDiscDragging,
    pointerHandlers: discPointerHandlers,
  } = useDiscSurfaceDrag(!isCaseOpen || isLaunching);
  const coverUrl =
    [...album.images].sort((a, b) => b.width - a.width)[0]?.url ??
    album.images[0]?.url;

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
    let cancelled = false;
    setReleaseMeta({
      year: album.release_date?.slice(0, 4),
      label: album.label,
      format: "COMPACT DISC",
      tags: album.genres ?? [],
    });

    const query = new URLSearchParams({
      artist: album.artists.map((artist) => artist.name).join(", "),
      album: album.name,
    });

    fetch(
      `/api/album/${encodeURIComponent(album.id)}/release-meta?${query.toString()}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReleaseMeta | null) => {
        if (!cancelled && data) {
          setReleaseMeta((current) => ({
            ...current,
            ...data,
            tags: data.tags?.length ? data.tags : current.tags,
          }));
        }
      })
      .catch(() => undefined);

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

  const handleCloseCase = () => {
    if (isCaseOpen) setIsCaseOpen(false);
  };

  const handleLoad = () => {
    if (isLaunching || !isCaseOpen || !discRef.current) return;

    const rect = discRef.current.getBoundingClientRect();
    setLaunchOrigin({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    setIsLaunching(true);
    setIsLifting(true);
  };

  useEffect(() => {
    if (
      !isLaunching ||
      !launchOrigin ||
      !launchDiscRef.current ||
      !launchSpinnerRef.current
    ) {
      return;
    }

    const disc = launchDiscRef.current;
    const spinner = launchSpinnerRef.current;
    handedOffRef.current = false;
    launchTimelineRef.current?.kill();

    gsap.set(disc, {
      left: launchOrigin.left + launchOrigin.width / 2,
      top: launchOrigin.top + launchOrigin.height / 2,
      width: launchOrigin.width,
      height: launchOrigin.height,
      xPercent: -50,
      yPercent: -50,
      y: 0,
      scale: 0.92,
      opacity: 1,
      rotate: 0,
    });
    gsap.set(spinner, { rotate: 0 });

    const tl = gsap.timeline();
    launchTimelineRef.current = tl;

    tl.fromTo(
      disc,
      { scale: 0.92, y: 0 },
      {
        scale: 1.14,
        y: -56,
        duration: 0.2,
        ease: "back.out(3.2)",
      },
    );
    tl.to(disc, {
      scale: 1,
      y: -40,
      duration: 0.16,
      ease: "power1.out",
    });
    tl.to(
      spinner,
      {
        rotate: 1080,
        duration: 1.36,
        ease: "none",
      },
      0,
    );
    tl.call(() => setIsCaseOpen(false), [], CASE_CLOSE_START_MS / 1000);
    tl.to(
      disc,
      {
        y: -72,
        duration: (CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
        ease: "sine.inOut",
      },
      CASE_CLOSE_START_MS / 1000,
    );
    tl.call(
      () => setIsExiting(true),
      [],
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
    );
    tl.to(
      disc,
      {
        y: -82,
        duration: EXIT_MS / 1000,
        ease: "sine.inOut",
      },
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
    );
    tl.call(
      () => {
        if (handedOffRef.current || !launchDiscRef.current) return;
        handedOffRef.current = true;
        onLoad(launchDiscRef.current);
      },
      [],
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS + EXIT_MS) /
        1000,
    );

    return () => {
      tl.kill();
      launchTimelineRef.current = null;
    };
  }, [isLaunching, launchOrigin, onLoad]);

  useEffect(() => {
    return () => {
      launchTimelineRef.current?.kill();
    };
  }, []);

  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const totalDuration =
    tracks?.reduce((total, track) => total + track.duration_ms, 0) ?? 0;

  const leftTransform = isCaseOpen
    ? "perspective(1500px) rotateY(9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const rightTransform = isCaseOpen
    ? "perspective(1500px) rotateY(-9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const discTransform = isCaseOpen
    ? "translateZ(12px) scale(1) rotate(-25deg)"
    : "translateZ(-6px) scale(0.82) rotate(-8deg)";

  return (
    <div
      className={[styles.overlay, isExiting ? styles.overlayExiting : ""].filter(Boolean).join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((a) => a.name).join(", ")}`}
    >
      <button
        type="button"
        className={styles.scrim}
        onClick={() => !isLaunching && onClose()}
        aria-label="Cerrar"
      />

      <div
        className={[styles.sheet, polishStyles.modalPolish, isOpen ? styles.sheetOpen : "", isLaunching ? styles.sheetLaunching : ""].filter(Boolean).join(" ")}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>álbum / caja de CD</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>
              {album.artists.map((a) => a.name).join(", ")}
              {album.release_date?.slice(0, 4)
                ? ` · ${album.release_date.slice(0, 4)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Cerrar"
          >
            <span className={polishStyles.closeIcon} aria-hidden="true">
              ×
            </span>
            <span className={polishStyles.closeLabel}>cerrar</span>
          </button>
        </header>

        <div className={styles.casePerspective}>
          <div className={styles.caseShell}>
            <div className={motionStyles.closedStage}>
              {!isCaseOpen && (
                <button
                  type="button"
                  className={motionStyles.closedHitArea}
                  onClick={handleOpenCase}
                  aria-label={`Abrir caja de CD de ${album.name}`}
                />
              )}

              <aside
                className={`${motionStyles.closedMeta} ${isCaseOpen ? motionStyles.closedMetaOpen : ""}`}
                aria-hidden={isCaseOpen}
              >
                <div className={motionStyles.closedMetaPanel}>
                  <div className={motionStyles.closedMetaHeader}>
                    <span>RELEASE DATA</span>
                    <span>{releaseMeta?.format ?? "COMPACT DISC"}</span>
                  </div>
                  <div className={motionStyles.closedMetaGrid}>
                    <div>
                      <small>YEAR</small>
                      <strong>
                        {releaseMeta?.year ??
                          album.release_date?.slice(0, 4) ??
                          "—"}
                      </strong>
                    </div>
                    <div>
                      <small>COUNTRY</small>
                      <strong>{releaseMeta?.country ?? "—"}</strong>
                    </div>
                    <div>
                      <small>LABEL</small>
                      <strong>{releaseMeta?.label ?? "—"}</strong>
                    </div>
                    <div>
                      <small>GENRE</small>
                      <strong>
                        {releaseMeta.tags?.slice(0, 2).join(" · ") || "—"}
                      </strong>
                    </div>
                  </div>
                  <div className={motionStyles.closedMetaTags}>
                    {(releaseMeta?.tags?.length
                      ? releaseMeta.tags
                      : (album.genres ?? [])
                    )
                      .slice(0, 3)
                      .map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                  </div>
                  <div
                    className={motionStyles.closedMetaCode}
                    aria-hidden="true"
                  />
                </div>
              </aside>

              <section
                className={`${motionStyles.closedFace} ${isCaseOpen ? motionStyles.closedFaceOpen : ""}`}
                aria-hidden="true"
              >
                <div className={motionStyles.closedFacePanel}>
                  <div className={motionStyles.closedArtwork}>
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt={album.name}
                        fill
                        unoptimized
                        className={motionStyles.closedArtworkImage}
                      />
                    )}
                  </div>
                  <div
                    className={motionStyles.closedAcrylic}
                    aria-hidden="true"
                  >
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipTopLeft}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipTopRight}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomLeft}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomRight}`}
                    />
                  </div>
                </div>
                <div className={motionStyles.closedSpine} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </section>
            </div>

            <div
              className={`${motionStyles.caseSpread} ${isCaseOpen ? motionStyles.caseSpreadOpen : ""}`}
              aria-hidden={!isCaseOpen}
            >
              <section
                className={`${styles.leftLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: leftTransform }}
                aria-label="Portada y lista de canciones"
              >
                <div
                  className={`${styles.paperbackPanel} ${denseTracklist ? densityStyles.paperbackPanelDense : ""}`}
                >
                  <div className={styles.coverPanel}>
                    {coverUrl && (
                      <Image
                        src={coverUrl}
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
                        <li className={`${styles.trackRow} ${densityStyles.loadingRow}`}>LEYENDO TOC...</li>
                      )}
                      {!loading &&
                        tracks?.map((t, i) => (
                          <li
                            key={`${t.name}-${i}`}
                            className={
                              denseTracklist
                                ? densityStyles.trackRowDense
                                : styles.trackRow
                            }
                          >
                            <span
                              className={
                                denseTracklist
                                  ? densityStyles.trackIndexDense
                                  : styles.trackIndex
                              }
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={
                                denseTracklist
                                  ? densityStyles.trackNameDense
                                  : styles.trackName
                              }
                            >
                              {t.name}
                            </span>
                            {!denseTracklist && (
                              <span className={styles.trackDuration}>
                                {fmt(t.duration_ms)}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className={motionStyles.leftLeafCloseHitArea}
                    onClick={handleCloseCase}
                    aria-label="Cerrar caja de CD"
                    tabIndex={isCaseOpen ? 0 : -1}
                  />
                </div>
              </section>

              <section
                className={`${styles.rightLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: rightTransform }}
                aria-label="Disco"
              >
                <div className={styles.tray}>
                  <div className={styles.trayTexture} aria-hidden="true" />
                  <div className={styles.trayHub} aria-hidden="true">
                    <span />
                  </div>
                  <div className={styles.trayClips} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div
                    ref={discRef}
                    className={[styles.disc, motionStyles.motionDisc, isDiscDragging ? styles.discIsDragging : "", isLaunching ? styles.discLaunchHidden : ""].filter(Boolean).join(" ")}
                    role="slider"
                    tabIndex={isCaseOpen ? 0 : -1}
                    aria-label="Girar CD"
                    aria-valuemin={-180}
                    aria-valuemax={180}
                    aria-valuenow={Math.round(discDragRotation)}
                    {...discPointerHandlers}
                    aria-hidden="true"
                    style={{
                      transform: isCaseOpen
                        ? `translateZ(10px) rotate(calc(-45deg + ${discDragRotation}deg))`
                        : discTransform,
                      opacity: isCaseOpen && !isLaunching ? 1 : 0,
                    }}
                  >
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt=""
                        fill
                        unoptimized
                        className={styles.discArt}
                      />
                    )}
                    <span className={styles.discSheen} aria-hidden="true" />
                    <span className={styles.discRing} aria-hidden="true" />
                    <span className={styles.discHub} aria-hidden="true" />
                  </div>
                  <div
                    className={`${styles.discGrabSurface} ${isDiscDragging ? styles.discGrabSurfaceActive : ""}`}
                    role="slider"
                    tabIndex={isCaseOpen ? 0 : -1}
                    aria-label="Girar CD"
                    aria-valuemin={-180}
                    aria-valuemax={180}
                    aria-valuenow={Math.round(discDragRotation)}
                    {...discPointerHandlers}
                  />
                </div>
              </section>
            </div>

            <div
              className={`${styles.hinge} ${
                isCaseOpen ? styles.hingeOpen : styles.hingeClosed
              }`}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>
            <div className={styles.acrylicReflection} aria-hidden="true" />
          </div>
        </div>

        {isLaunching && launchOrigin && (
          <div className={styles.launchDiscLayer} aria-hidden="true">
            <div
              ref={launchDiscRef}
              className={[styles.launchDisc, isLifting ? styles.launchDiscLifting : ""].filter(Boolean).join(" ")}
            >
              <div className={styles.launchDiscHalo} />
              <div ref={launchSpinnerRef} className={styles.launchDiscSpinner}>
                {coverUrl && (
                  <Image
                    src={coverUrl}
                    alt=""
                    fill
                    unoptimized
                    className={styles.launchDiscArt}
                  />
                )}
                <span className={styles.launchDiscSheen} />
                <span className={styles.launchDiscRing} />
                <span className={styles.launchDiscHub} />
              </div>
            </div>
          </div>
        )}

        <footer className={[styles.actions, polishStyles.vfdFooter].join(" ")}>
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
