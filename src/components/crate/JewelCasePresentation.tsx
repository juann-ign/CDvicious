"use client";

import Image from "next/image";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import { useDiscSurfaceDrag } from "@/hooks/useDiscSurfaceDrag";
import { RailContext } from "@/components/scroll/RailContext";
import styles from "./JewelCasePresentation.case.module.css";
import densityStyles from "./JewelCasePresentation.density.module.css";
import motionStyles from "./JewelCasePresentation.motion.module.css";
import presentation from "./JewelCasePresentation.module.css";

// One hinge, shared by modal and inline consumers. These are the modal's
// existing transform duration and angles, not a second approximation.
export const JEWEL_CASE_HINGE_MS = 1000;

interface ReleaseMeta {
  year?: string;
  label?: string;
  catalogNumber?: string;
  format?: string;
  country?: string;
  tags?: string[];
}

export interface JewelCasePresentationProps {
  album: AlbumItem;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onClosed?: () => void;
  onOpened?: () => void;
  disabled?: boolean;
  active?: boolean;
  hideDisc?: boolean;
  discRef: RefObject<HTMLDivElement | null>;
  variant?: "modal" | "inline";
  artwork?: "cover" | "neutral";
}

function fmt(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function JewelCasePresentation({ album, open, onOpen, onClose, onClosed, onOpened, disabled = false, active = true, hideDisc = false, discRef, variant = "modal", artwork = "cover" }: JewelCasePresentationProps) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [tracksError, setTracksError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [releaseMeta, setReleaseMeta] = useState<ReleaseMeta>({});
  const [isCaseOpen, setCaseOpen] = useState(false);
  const [reverse, setReverse] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [phase, setPhase] = useState("closed");
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const openedRef = useRef(onOpened);
  openedRef.current = onOpened;
  const hingeRef = useRef<HTMLElement | null>(null);
  const rail = useContext(RailContext);
  const startRail = rail?.start;
  const stopRail = rail?.stop;
  const token = useRef(Symbol("shared-jewel-case-disc"));
  const pointer = useRef<{ id: number; surface: HTMLDivElement; startX: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const { rotation: discDragRotation, isDragging: isDiscDragging, cancel, pointerHandlers } = useDiscSurfaceDrag(!isCaseOpen || !active || disabled || hideDisc);
  const release = useCallback((cancelled = true) => {
    const current = pointer.current;
    pointer.current = null;
    if (current) suppressClick.current = current.moved;
    startRail?.(token.current);
    if (cancelled) cancel();
    if (current?.surface.hasPointerCapture(current.id)) current.surface.releasePointerCapture(current.id);
  }, [cancel, startRail]);

  useEffect(() => {
    const controller = new AbortController();
    setTracks(null); setTracksError(false); setReverse(false); setInspecting(false);
    setReleaseMeta({ year: album.release_date?.slice(0, 4), label: album.label, format: "COMPACT DISC", tags: album.genres ?? [] });
    void fetch(`/api/album/${encodeURIComponent(album.id)}/tracks`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("tracks"); return response.json(); })
      .then((data: { tracks?: AlbumTrack[] }) => {
        if (!Array.isArray(data.tracks)) throw new Error("invalid tracks");
        if (!controller.signal.aborted) setTracks(data.tracks);
      })
      .catch(() => { if (!controller.signal.aborted) { setTracks([]); setTracksError(true); } });
    if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK !== "1") {
      const query = new URLSearchParams({ artist: album.artists.map((artist) => artist.name).join(", "), album: album.name });
      void fetch(`/api/album/${encodeURIComponent(album.id)}/release-meta?${query}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((data: ReleaseMeta | null) => { if (!controller.signal.aborted && data) setReleaseMeta((current) => ({ ...current, ...data, tags: data.tags?.length ? data.tags : current.tags })); })
        .catch(() => undefined);
    }
    return () => controller.abort();
  }, [album.id, album.name, album.artists, album.release_date, album.label, album.genres, retry]);

  useLayoutEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      setPhase(open ? "open" : "closed");
      if (open) openedRef.current?.();
      else closedRef.current?.();
    };
    const observeTransition = () => {
      if (settled) return;
      const hinge = hingeRef.current;
      // React commits the controlled class before we inspect its CSS timeline.
      // A busy or deferred render must not turn elapsed wall time into "open".
      if (!hinge || hinge.classList.contains(motionStyles.closedFaceOpen) !== open) {
        frame = requestAnimationFrame(observeTransition);
        return;
      }
      const transitions = hinge.getAnimations().filter((animation) =>
        "transitionProperty" in animation && animation.transitionProperty === "transform");
      if (!transitions.length) finish();
      else void Promise.all(transitions.map((animation) => animation.finished))
        .then(finish)
        .catch(() => {
          // Reduced motion can remove a live transition without changing open.
          // Reopening/unmounting cancels this observer through the same guard.
          if (!settled) {
            if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
            else frame = requestAnimationFrame(observeTransition);
          }
        });
    };
    const begin = () => {
      // Preserve the closed baseline on a newly mounted inline case, then let
      // getAnimations flush the committed target class on the following frame.
      if (hingeRef.current && !reduced) void getComputedStyle(hingeRef.current).transform;
      setCaseOpen(open);
      setPhase(open ? "opening" : "closing");
      if (reduced) finish();
      else frame = requestAnimationFrame(observeTransition);
    };
    frame = reduced ? 0 : requestAnimationFrame(begin);
    if (reduced) begin();
    return () => { settled = true; cancelAnimationFrame(frame); };
  }, [open]);

  useEffect(() => {
    const finish = (event: Event) => {
      if (event instanceof PointerEvent && pointer.current && event.pointerId !== pointer.current.id) return;
      if (pointer.current) release(event.type !== "pointerup");
    };
    const visibility = () => { if (document.visibilityState === "hidden") release(); };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      release();
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [release]);
  useEffect(() => { if (!active || disabled || !open) release(); }, [active, disabled, open, release]);

  const loading = tracks === null;
  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const coverUrl = artwork === "neutral" ? undefined : [...album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
  const leftTransform = isCaseOpen ? "perspective(1500px) rotateY(9deg)" : "perspective(1500px) rotateY(0deg)";
  const rightTransform = isCaseOpen ? "perspective(1500px) rotateY(-9deg)" : "perspective(1500px) rotateY(0deg)";
  const discTransform = isCaseOpen ? "translateZ(12px) scale(1) rotate(-25deg)" : "translateZ(-6px) scale(0.82) rotate(-8deg)";
  const isLaunching = hideDisc;
  const handleOpenCase = () => { if (active && !disabled) onOpen(); };
  const handleCloseCase = () => { if (active && !disabled) onClose(); };

  return <div className={`${presentation.root} ${variant === "inline" ? presentation.inline : ""}`} data-jewel-case="shared" data-testid="jewel-case-presentation" data-case-open={isCaseOpen} data-presentation={phase} data-variant={variant} data-state={phase} data-open={isCaseOpen} data-album-id={album.id} data-gesture-owner="detail" inert={!active} onClick={(event) => event.stopPropagation()}>
<div className={`${styles.casePerspective} ${presentation.perspective}`}>
          <div className={`${styles.caseShell} ${presentation.shell}`}>
            <div className={motionStyles.closedStage}>
              {!isCaseOpen && (
                <button
                  type="button"
                  className={`${motionStyles.closedHitArea} ${presentation.caseHitTarget}`}
                  data-testid="jewel-case-open-target"
                  onClick={handleOpenCase}
                  aria-label={`Abrir caja de ${album.name}`}
                  disabled={disabled}
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
                data-testid="jewel-case-hinge"
                ref={hingeRef}
                aria-hidden="true"
              >
                <div className={motionStyles.closedFacePanel}>
                  <div className={motionStyles.closedArtwork}>
                    {!coverUrl && <div className={presentation.neutralArtwork}><strong>{album.name}</strong><span>{album.artists.map((artist) => artist.name).join(", ")}</span><small>PORTADA ORIGINAL EN SPOTIFY</small></div>}
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
              inert={!isCaseOpen || disabled}
            >
              <section
                className={`${styles.leftLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: leftTransform }}
                aria-label="Portada y lista de canciones"
                data-testid="jewel-case-tracklist"
              >
                <div
                  className={`${styles.paperbackPanel} ${denseTracklist ? densityStyles.paperbackPanelDense : ""}`}
                >
                  <div className={`${styles.coverPanel} ${densityStyles.coverPanel}`}>
                    {!coverUrl && <div className={presentation.neutralArtwork}><strong>{album.name}</strong><small>BOOKLET ORIGINAL NO DISPONIBLE</small></div>}
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

                  <div className={`${styles.trackPanel} ${densityStyles.trackPanel} ${presentation.trackContent}`}>
                    <h3 className={presentation.caseTitle} title={album.name}>{album.name}</h3>
                    <ul
                      className={`${styles.tracklist} ${presentation.trackScroll} ${denseTracklist ? densityStyles.trackGridDense : ""}`}
                      tabIndex={isCaseOpen ? 0 : -1}
                      aria-label="Lista de pistas"
                      data-lenis-prevent=""
                      style={
                        denseTracklist
                          ? ({ "--track-rows": trackRows } as CSSProperties)
                          : undefined
                      }
                    >
                      {loading && (
                        <li className={`${styles.trackRow} ${densityStyles.loadingRow}`}>LEYENDO TOC...</li>
                      )}
                      {!loading && !tracksError && tracks?.length === 0 && <li role="status">LISTA DE PISTAS NO DISPONIBLE</li>}
                      {tracksError && <li className={presentation.trackError} role="status">No se pudo cargar la lista de pistas.<button type="button" onClick={() => setRetry((value) => value + 1)}>Reintentar pistas</button></li>}
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
                            <span className={`${denseTracklist ? densityStyles.trackNameDense : styles.trackName} ${presentation.trackTitle}`} title={t.name}>
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
                    className={`${motionStyles.leftLeafCloseHitArea} ${presentation.caseHitTarget}`}
                    onClick={handleCloseCase}
                    aria-label="Cerrar caja de CD"
                    tabIndex={isCaseOpen ? 0 : -1}
                    disabled={disabled}
                  ><span /><span /><span /><span /></button>
                </div>
              </section>

              <section
                className={`${styles.rightLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: rightTransform }}
                aria-label="Disco"
                data-testid="jewel-case-tray"
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
                    className={[styles.disc, motionStyles.motionDisc, isDiscDragging ? styles.discIsDragging : "", isLaunching ? styles.discLaunchHidden : "", presentation.discInteractive].filter(Boolean).join(" ")}
                    role="slider"
                    tabIndex={isCaseOpen ? 0 : -1}
                    aria-label="Girar CD"
                    aria-valuemin={-180}
                    aria-valuemax={180}
                    aria-valuenow={Math.round(discDragRotation)}
                    data-testid={variant === "inline" ? "artist-case-cd" : "jewel-case-cd"}
                    data-album-id={album.id}
                    data-flipped={reverse}
                    data-inspecting={inspecting}
                    aria-valuetext={`${reverse ? "Reverso" : "Frente"} del CD, ${Math.round(discDragRotation)} grados${inspecting ? ", inspección activa" : ""}`}
                    aria-disabled={disabled || !active || undefined}
                    onPointerDown={(event) => {
                      if (!active || disabled || event.button !== 0 || pointer.current) return;
                      pointer.current = { id: event.pointerId, surface: event.currentTarget, startX: event.clientX, moved: false };
                      suppressClick.current = false;
                      stopRail?.(token.current);
                      event.currentTarget.setPointerCapture(event.pointerId);
                      pointerHandlers.onPointerDown(event);
                    }}
                    onPointerMove={(event) => { if (pointer.current?.id === event.pointerId && Math.abs(event.clientX - pointer.current.startX) > 6) pointer.current.moved = true; }}
                    onPointerCancel={() => release()}
                    onLostPointerCapture={() => { if (pointer.current) release(); }}
                    onClick={(event) => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } setInspecting((value) => !value); }}
                    onKeyDown={(event) => {
                      if (!active || disabled || !isCaseOpen) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        setInspecting((value) => !value);
                      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.stopPropagation();
                        pointerHandlers.onKeyDown(event);
                      }
                    }}
                    style={{
                      transform: isCaseOpen
                        ? `translateZ(10px) rotate(calc(-45deg + ${discDragRotation}deg))`
                        : discTransform,
                      opacity: isCaseOpen && !isLaunching ? 1 : 0,
                    }}
                  >
                    {coverUrl && !reverse && (
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
                  <div className={presentation.discTools}><span>ARRASTRÁ · ← →</span><button type="button" disabled={!active || disabled || !isCaseOpen} onClick={() => setReverse((value) => !value)} aria-pressed={reverse}>GIRAR CD</button></div>
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
  </div>;
}
