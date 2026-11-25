"use client";

import Image from "next/image";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { AlbumItem } from "@/types/crate";
import { useAlbumTracks } from "@/hooks/useAlbumTracks";
import { useDiscSurfaceDrag } from "@/hooks/useDiscSurfaceDrag";
import { RailContext } from "@/components/scroll/RailContext";
import styles from "./JewelCasePresentation.case.module.css";
import densityStyles from "./JewelCasePresentation.density.module.css";
import motionStyles from "./JewelCasePresentation.motion.module.css";
import presentation from "./JewelCasePresentation.module.css";
import material from "./JewelCaseMaterial.module.css";

// One hinge, shared by modal and inline consumers. These are the modal's
// existing transform duration and angles, not a second approximation.
export const JEWEL_CASE_HINGE_MS = 1000;

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
  const { tracks, loading, error: tracksError, errorMessage, canRetry, retry: retryTracks } = useAlbumTracks(album.id, open);
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
    setReverse(false); setInspecting(false);
  }, [album.id]);

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

  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const coverUrl = artwork === "neutral" ? undefined : [...album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url;
  const leftTransform = isCaseOpen ? "perspective(1500px) rotateY(9deg)" : "perspective(1500px) rotateY(0deg)";
  const rightTransform = isCaseOpen ? "perspective(1500px) rotateY(-9deg)" : "perspective(1500px) rotateY(0deg)";
  const discTransform = isCaseOpen ? "translateZ(12px) scale(1) rotate(-25deg)" : "translateZ(-6px) scale(0.82) rotate(-8deg)";
  const isLaunching = hideDisc;
  const handleOpenCase = () => { if (active && !disabled) onOpen(); };
  const handleCloseCase = () => { if (active && !disabled) onClose(); };

  return <div className={`${presentation.root} ${material.finish} ${variant === "inline" ? presentation.inline : ""}`} data-jewel-case="shared" data-jewel-material="shared" data-testid="jewel-case-presentation" data-case-open={isCaseOpen} data-presentation={phase} data-variant={variant} data-state={phase} data-open={isCaseOpen} data-album-id={album.id} data-gesture-owner="detail" inert={!active} onClick={(event) => event.stopPropagation()}>
<div className={`${styles.casePerspective} ${presentation.perspective}`}>
          <div className={`${styles.caseShell} ${presentation.shell}`}>
            <div className={`${motionStyles.closedStage} ${isCaseOpen ? motionStyles.closedStageOpen : ""}`}>
              {!isCaseOpen && (
                <button
                  type="button"
                  className={`${motionStyles.closedHitArea} ${presentation.caseHitTarget}`}
                  data-testid="jewel-case-open-target"
                  data-case-edge="open"
                  onClick={handleOpenCase}
                  aria-label={`Abrir caja de ${album.name}`}
                  disabled={disabled}
                />
              )}

              <section
                className={`${motionStyles.closedFace} ${isCaseOpen ? motionStyles.closedFaceOpen : ""}`}
                data-testid="jewel-case-hinge"
                ref={hingeRef}
                aria-hidden="true"
              >
                <div className={`${motionStyles.closedFacePanel} ${material.face}`}>
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
                    <span className={material.bookletMold} data-jewel-detail="booklet-mold" aria-hidden="true" />
                  </div>
                  <div className={`${motionStyles.closedSpine} ${material.hinge}`} aria-hidden="true" />
                  <span className={`${material.lid} ${motionStyles.closedLid}`} aria-hidden="true" />
                </div>
              </section>
            </div>

            <div
              className={`${motionStyles.caseSpread} ${isCaseOpen ? motionStyles.caseSpreadOpen : ""}`}
              aria-hidden={!isCaseOpen}
              inert={!isCaseOpen || disabled}
            >
              <section
                className={`${styles.leftLeaf} ${motionStyles.motionLeaf} ${material.face}`}
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
                  </div>

                  <div className={`${styles.trackPanel} ${densityStyles.trackPanel} ${presentation.trackContent}`}>
                    <h3 className={presentation.caseTitle} title={album.name}>{album.name}</h3>
                    <ul
                      className={`${styles.tracklist} ${presentation.trackScroll} ${denseTracklist ? densityStyles.trackGridDense : ""}`}
                      tabIndex={isCaseOpen ? 0 : -1}
                      aria-label="Lista de pistas"
                      data-track-layout={denseTracklist ? "columns" : "single"}
                      data-track-count={tracks?.length ?? 0}
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
                      {tracksError && <li className={presentation.trackError} role="status">{errorMessage ?? "No se pudo cargar la lista de pistas."}<button type="button" onClick={retryTracks} disabled={!canRetry}>Reintentar pistas</button></li>}
                      {!loading &&
                        tracks?.map((t, i) => (
                          <li
                              key={t.position}
                            aria-label={`${String(i + 1).padStart(2, "0")}. ${t.name}, ${fmt(t.duration_ms)}`}
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
                              <span className={denseTracklist ? densityStyles.trackDurationDense : styles.trackDuration}>
                                {fmt(t.duration_ms)}
                              </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
                <span className={`${material.bookletMold} ${styles.leftBookletMold}`} data-jewel-detail="booklet-mold" aria-hidden="true" />
                <span className={`${material.lid} ${styles.leafLid}`} aria-hidden="true" />
                  <button
                    type="button"
                    className={`${motionStyles.leftLeafCloseHitArea} ${presentation.caseHitTarget}`}
                    onClick={handleCloseCase}
                    aria-label="Cerrar caja de CD"
                    data-case-edge="close-left"
                    data-testid="jewel-case-close-left"
                    tabIndex={isCaseOpen ? 0 : -1}
                    disabled={disabled}
                  ><span /><span /><span /><span /></button>
              </section>

              <section
                className={`${styles.rightLeaf} ${motionStyles.motionLeaf} ${material.face}`}
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
                    <span data-disc-pose-corner="tl" style={{ position: "absolute", width: 0, height: 0, top: 0, left: 0, pointerEvents: "none" }} aria-hidden="true" />
                    <span data-disc-pose-corner="tr" style={{ position: "absolute", width: 0, height: 0, top: 0, left: "100%", pointerEvents: "none" }} aria-hidden="true" />
                    <span data-disc-pose-corner="bl" style={{ position: "absolute", width: 0, height: 0, top: "100%", left: 0, pointerEvents: "none" }} aria-hidden="true" />
                    <span data-disc-pose-corner="br" style={{ position: "absolute", width: 0, height: 0, top: "100%", left: "100%", pointerEvents: "none" }} aria-hidden="true" />
                    <span data-disc-pose-center style={{ position: "absolute", width: 0, height: 0, top: "50%", left: "50%", pointerEvents: "none" }} aria-hidden="true" />
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
                  <div className={presentation.discTools}><button type="button" disabled={!active || disabled || !isCaseOpen} onClick={() => setReverse((value) => !value)} aria-pressed={reverse}>GIRAR CD</button></div>
                </div>
                <span className={`${material.lid} ${styles.leafLid}`} aria-hidden="true" />
                <button type="button" className={`${presentation.rightEdgeClose} ${presentation.caseHitTarget}`}
                  data-case-edge="close-right" data-testid="jewel-case-close-right"
                  onClick={handleCloseCase} aria-label="Cerrar caja desde el borde derecho"
                  tabIndex={isCaseOpen ? 0 : -1} disabled={disabled} />
              </section>
            </div>

            <div
              className={`${styles.hinge} ${material.hinge} ${
                isCaseOpen ? styles.hingeOpen : styles.hingeClosed
              }`}
              aria-hidden="true"
            />
          </div>
        </div>
  </div>;
}
