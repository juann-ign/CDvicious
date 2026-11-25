"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { flushSync } from "react-dom";
import { useRailActions } from "@/components/scroll/RailContext";
import { advanceArtistCycle, artistCaseSlots, fitArtistTitle } from "@/lib/artistCaseLayout";
import type { ArtistRelease } from "@/types/artist";
import { ArtistInlineCase } from "./ArtistInlineCase";
import styles from "./ArtistDiscography.module.css";

export type CaseMode = "browse" | "selected" | "open";
interface Props {
  albums: ArtistRelease[];
  index: number;
  mode: CaseMode;
  active: boolean;
  drifting: boolean;
  hiddenDiscId?: string;
  disabled?: boolean;
  select: (index: number) => void;
  advance: () => void;
  open: () => void;
  escape: () => void;
  onPlay: (album: ArtistRelease, element: HTMLElement) => void;
  discRef: RefObject<HTMLDivElement | null>;
  caseRef: RefObject<HTMLButtonElement | null>;
}

function CaseTitle({ value, vertical = false }: { value: string; vertical?: boolean }) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let cancelled = false;
    const context = document.createElement("canvas").getContext("2d");
    const fit = () => {
      if (cancelled || !context) return;
      const available = vertical ? element.clientHeight : element.clientWidth;
      if (!available) return;
      const font = getComputedStyle(element);
      context.font = font.font || `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      const spacing = parseFloat(font.letterSpacing) || 0;
      setText(fitArtistTitle(value, available, (candidate) => context.measureText(candidate).width + Math.max(0, candidate.length - 1) * spacing));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    void document.fonts.ready.then(fit);
    return () => { cancelled = true; observer.disconnect(); };
  }, [value, vertical]);
  return <span ref={elementRef} data-full-title={value}>{text}</span>;
}

// At the step boundary, slot N becomes N-1 at exactly the same pixel. Only
// offscreen copies are recycled; every edition retains one canonical button.
export function ArtistDiscScene({ albums, index, mode, active, drifting, hiddenDiscId, disabled, select, advance, open, escape, onPlay, discRef, caseRef }: Props) {
  const { start, stop } = useRailActions();
  const token = useRef(Symbol("artist-jewelcase-drag"));
  const sceneRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ owner: "catalog" | "case"; x: number; last: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const phase = useRef(0);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const selectRef = useRef(select);
  selectRef.current = select;
  const indexRef = useRef(index);
  indexRef.current = index;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [focusedAlbum, setFocusedAlbum] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const activeRef = useRef(active);
  const modeRef = useRef(mode);
  activeRef.current = active;
  modeRef.current = mode;
  const albumId = albums[index]?.id;
  const detailVisible = mode === "open" || (detailId === albumId && mode === "selected");
  const closeDone = useCallback(() => {
    setDetailId(null);
    if (activeRef.current && modeRef.current === "selected") requestAnimationFrame(() => caseRef.current?.focus({ preventScroll: true }));
  }, [caseRef]);
  useEffect(() => {
    if (mode === "open") setDetailId(albumId);
    else if (mode === "browse" || detailId !== albumId) setDetailId(null);
  }, [mode, albumId, detailId]);
  const running = active && drifting && mode === "browse" && !hovered && !focused && !dragging && !disabled && albums.length > 1;
  useLayoutEffect(() => {
    // The strip is positioned, never a native horizontal scroller. Focusing
    // an edition must not leave a hidden scroll offset behind its transforms.
    if (sceneRef.current) sceneRef.current.scrollLeft = 0;
  }, [index, mode]);
  const release = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    start(token.current);
    setDragging(false);
    sceneRef.current?.style.setProperty("--drag", "0px");
    if (current && sceneRef.current?.hasPointerCapture(current.id)) sceneRef.current.releasePointerCapture(current.id);
  }, [start]);

  useEffect(() => {
    const element = sceneRef.current;
    if (!element) return;
    setHovered(active && element.matches(":hover"));
    const down = (event: PointerEvent) => {
      if (!gesture.current) suppressClick.current = false;
      if (disabled || !active || event.button !== 0 || gesture.current) return;
      const target = event.target as Element;
      if (target.closest("[data-gesture-owner]")) return;
      const caseTarget = target.closest("[data-case-hit]");
      if (!caseTarget && target.closest("button, a, input")) return;
      suppressClick.current = false;
      gesture.current = { owner: caseTarget ? "case" : "catalog", x: event.clientX, last: event.clientX, id: event.pointerId, moved: false };
    };
    const move = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      current.last = event.clientX;
      const delta = event.clientX - current.x;
      if (current.owner === "case") {
        if (Math.abs(delta) > 6) { current.moved = true; suppressClick.current = true; }
        return;
      }
      if (!current.moved && Math.abs(delta) > 6) {
        current.moved = true;
        suppressClick.current = true;
        stop(token.current);
        setDragging(true);
        element.setPointerCapture(event.pointerId);
      }
      if (current.moved) element.style.setProperty("--drag", `${delta}px`);
    };
    const finish = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (event.type === "pointerup" && current.owner === "catalog" && current.moved) {
        const bounds = element.querySelector<HTMLElement>("[data-case-hit]")?.offsetWidth ?? 220;
        selectRef.current(indexRef.current - Math.round((current.last - current.x) / (bounds * .98 + 18)));
      }
      release();
    };
    const lost = (event: PointerEvent) => { if (gesture.current?.id === event.pointerId) release(); };
    element.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    element.addEventListener("lostpointercapture", lost);
    return () => {
      element.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      element.removeEventListener("lostpointercapture", lost);
      release();
    };
  }, [active, disabled, release, stop]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = advanceArtistCycle(phase.current, Math.min(48, now - previous));
      previous = now;
      phase.current = next.phase;
      // Commit the offset and its inverse phase in one paint at the seam.
      if (next.steps) flushSync(() => { for (let step = 0; step < next.steps; step++) advanceRef.current(); });
      sceneRef.current?.style.setProperty("--cycle-phase", String(phase.current));
      if (sceneRef.current) sceneRef.current.dataset.cyclePhase = phase.current.toFixed(5);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  useEffect(() => {
    if (mode === "browse") return;
    phase.current = 0;
    sceneRef.current?.style.setProperty("--cycle-phase", "0");
    if (sceneRef.current) sceneRef.current.dataset.cyclePhase = "0";
  }, [mode]);

  const slots = artistCaseSlots(albums.length, index, mode === "browse");
  // Chronological DOM/tab order is independent from the cyclic visual window.
  const ordered = [...slots].sort((a, b) => Number(a.copy) - Number(b.copy) || (a.copy ? a.offset - b.offset : a.at - b.at));
  const focusedTitle = albums.find((album) => album.id === focusedAlbum)?.name;
  const choose = (at: number, copy: boolean) => {
    if (disabled) return;
    if (mode !== "browse" && at === index) open(); else select(at);
    if (copy) requestAnimationFrame(() => caseRef.current?.focus({ preventScroll: true }));
  };
  return <div ref={sceneRef} className={styles.scene} data-testid="artist-disc-scene" data-mode={mode} data-reserved={detailVisible} data-drifting={running} data-dragging={dragging} data-cycle-index={index} data-cycle-phase={phase.current.toFixed(5)}
    role="group" aria-label="Recorrer discografía" tabIndex={-1}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onPointerMove={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
    onFocusCapture={(event) => { setFocused(true); setFocusedAlbum((event.target as Element).closest<HTMLElement>("button[data-album-id]")?.dataset.albumId ?? null); }}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setFocused(false); setFocusedAlbum(null); } }}
    onClickCapture={(event) => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
    onKeyDown={(event) => {
      if (disabled || (event.target as Element).closest("[data-gesture-owner], input")) return;
      if (event.key === "Escape") { event.preventDefault(); escape(); return; }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        select(event.key === "Home" ? 0 : event.key === "End" ? albums.length - 1 : index + (event.key === "ArrowLeft" ? -1 : 1));
        requestAnimationFrame(() => caseRef.current?.focus({ preventScroll: true }));
      }
    }}>
    <div className={styles.sceneLegend} aria-hidden="true"><span>{mode === "browse" ? "01 / RECORRER" : mode === "selected" ? "02 / SELECCIONAR" : "03 / INSPECCIONAR"}</span><span>CD · ARCHIVO FÍSICO</span></div>
    {focusedTitle && <div className={styles.focusedTitle} data-testid="artist-full-title" role="tooltip">{focusedTitle}</div>}
    <div className={styles.shelf} aria-hidden="true" />
    <div className={styles.cases}>
      {ordered.map(({ at, offset, copy }) => {
        const album = albums[at];
        if (!album) return null;
        const selected = mode !== "browse" && at === index;
        const props = {
          className: styles.casePosition,
          "data-selected": selected,
          "data-offset": offset,
          "data-copy": copy,
          "data-case-hit": album.id,
          style: { "--offset": offset, "--distance": Math.abs(offset), "--direction": Math.sign(offset), "--cover": album.artworkSource === "demo" && album.images[0] ? `url("${album.images[0].url}")` : "none" } as CSSProperties,
        };
        const content = <span className={styles.caseObject}>
          <span className={styles.caseBack} />
          <span className={styles.cover}><span className={styles.coverArt} data-artwork-source={album.artworkSource ?? "neutral"}>{!(album.artworkSource === "demo" && album.images.length) && <span><CaseTitle value={album.name} /><small>{album.artists[0]?.name}</small></span>}</span><span className={styles.frontSpineTitle}><CaseTitle value={album.name} vertical /></span></span>
          <span className={styles.spine}><span>{album.artists[0]?.name}</span><strong><CaseTitle value={album.name} vertical /></strong><small>{album.release_date?.slice(0, 4) ?? "—"}</small></span>
          <span className={styles.caseEdge} />
        </span>;
        // Visual copies delegate pointer selection by ID and never enter the
        // accessibility tree, tab order or the canonical album-control query.
        return copy ? <div key={`copy-${album.id}-${offset}`} {...props} aria-hidden="true" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(at, true)}>{content}</div>
          : <button key={album.id} {...props} ref={selected ? caseRef : undefined} type="button" disabled={disabled} tabIndex={at === index && mode !== "open" ? 0 : -1} aria-disabled={mode === "open" && selected || undefined}
            data-testid={selected ? "artist-selected-case" : undefined} data-album-id={album.id} data-release-date={album.release_date}
            aria-label={selected ? `Abrir caja de ${album.name}` : `Seleccionar ${album.name}`} aria-pressed={selected}
            onClick={() => choose(at, false)}>{content}</button>;
      })}
    </div>
    {detailVisible && albums[index] && <ArtistInlineCase key={albums[index].id} expanded={mode === "open"} onClosed={closeDone} onClose={escape} album={albums[index]} active={active} pending={Boolean(disabled)} hiddenDiscId={hiddenDiscId} discRef={discRef} onPlay={onPlay} />}
    <span className={styles.dragHint}>{mode === "browse" ? "ARRASTRÁ EL ESPACIO LIBRE · ELEGÍ UNA CAJA" : mode === "selected" ? "OTRO CLIC PARA ABRIR · ESC PARA RECORRER" : "CD: ARRASTRÁ PARA INSPECCIONAR · ESC PARA CERRAR"}</span>
  </div>;
}
