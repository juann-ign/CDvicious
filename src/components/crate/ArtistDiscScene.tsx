"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
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
  discRef: RefObject<HTMLButtonElement | null>;
  caseRef: RefObject<HTMLButtonElement | null>;
}

// Only a window and neighbours exist in the DOM. Browsing copies are inert;
// identity, focus and actions always belong to albumId.
export function ArtistDiscScene({ albums, index, mode, active, drifting, hiddenDiscId, disabled, select, advance, open, escape, onPlay, discRef, caseRef }: Props) {
  const { start, stop } = useRailActions();
  const token = useRef(Symbol("artist-jewelcase-drag"));
  const sceneRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ owner: "catalog" | "case"; x: number; last: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const drift = useRef(0);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  const selectRef = useRef(select);
  selectRef.current = select;
  const indexRef = useRef(index);
  indexRef.current = index;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const albumId = albums[index]?.id;
  const detailVisible = mode === "open" || (detailId === albumId && mode === "selected");
  const closeDone = useCallback(() => setDetailId(null), []);
  useEffect(() => {
    if (mode === "open") setDetailId(albumId);
    else if (mode === "browse" || detailId !== albumId) setDetailId(null);
  }, [mode, albumId, detailId]);
  const running = active && drifting && mode === "browse" && !hovered && !focused && !dragging && !disabled && albums.length > 1 && (albums.length > 17 || index < albums.length - 1);
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
    // The search result may be replaced by this scene under a stationary
    // pointer, which does not necessarily deliver a fresh pointerenter.
    setHovered(active && element.matches(":hover"));
    const down = (event: PointerEvent) => {
      if (!gesture.current) suppressClick.current = false;
      if (disabled || !active || event.button !== 0 || gesture.current) return;
      const target = event.target as Element;
      if (target.closest("[data-gesture-owner]")) return;
      const caseTarget = target.closest("button[data-album-id]");
      if (!caseTarget && target.closest("button, a, input, [data-gesture-owner]")) return;
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
      if (event.type === "pointerup" && current.owner === "catalog" && current.moved) selectRef.current(indexRef.current - Math.round((current.last - current.x) / 64));
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
      drift.current += Math.min(48, now - previous) * .012;
      previous = now;
      if (drift.current >= 64) { drift.current -= 64; advanceRef.current(); }
      sceneRef.current?.style.setProperty("--drift", `${-drift.current}px`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  useEffect(() => {
    if (mode === "browse") return;
    drift.current = 0;
    sceneRef.current?.style.setProperty("--drift", "0px");
  }, [mode]);

  const windowed = mode === "browse" && albums.length > 17
    ? Array.from({ length: 17 }, (_, slot) => {
      const offset = slot - 8;
      const at = ((index + offset) % albums.length + albums.length) % albums.length;
      return { album: albums[at], at, offset };
    })
    : albums.slice(Math.max(0, index - 7), index + 8).map((album, slot) => {
      const at = Math.max(0, index - 7) + slot;
      return { album, at, offset: at - index };
    });
  const canonical = new Map<string, number>();
  [...windowed].sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset)).forEach(({ album, offset }) => {
    if (album && !canonical.has(album.id)) canonical.set(album.id, offset);
  });
  return <div ref={sceneRef} className={styles.scene} data-testid="artist-disc-scene" data-mode={mode} data-reserved={detailVisible} data-drifting={running} data-dragging={dragging}
    role="group" aria-label="Recorrer discografía" tabIndex={0}
    onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    onPointerMove={(event) => { if (event.pointerType !== "touch") setHovered(true); }}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onClickCapture={(event) => { if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
    onKeyDown={(event) => {
      if (disabled || (event.target as Element).closest("[data-gesture-owner], input")) return;
      if (event.key === "Escape") { event.preventDefault(); escape(); return; }
      if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        select(event.key === "Home" ? 0 : event.key === "End" ? albums.length - 1 : index + (event.key === "ArrowLeft" ? -1 : 1));
      }
    }}>
    <div className={styles.sceneLegend} aria-hidden="true"><span>{mode === "browse" ? "01 / RECORRER" : mode === "selected" ? "02 / SELECCIONAR" : "03 / INSPECCIONAR"}</span><span>CD · ARCHIVO FÍSICO</span></div>
    <div className={styles.shelf} aria-hidden="true" />
    <div className={styles.cases}>
      {windowed.map(({ album, at, offset }) => {
        if (!album) return null;
        const selected = mode !== "browse" && at === index;
        const copy = canonical.get(album.id) !== offset;
        const props = {
          className: styles.casePosition,
          "data-selected": selected,
          "data-offset": offset,
          "data-copy": copy,
          style: { "--offset": offset, "--distance": Math.abs(offset), "--direction": Math.sign(offset), "--cover": album.artworkSource === "demo" && album.images[0] ? `url("${album.images[0].url}")` : "none" } as CSSProperties,
        };
        const content = <span className={styles.caseObject}>
          <span className={styles.caseBack} />
          <span className={styles.cover}><span className={styles.coverArt} data-artwork-source={album.artworkSource ?? "neutral"}>{!(album.artworkSource === "demo" && album.images.length) && <span>{album.name}<small>{album.artists[0]?.name}</small></span>}</span></span>
          <span className={styles.spine}><span>{album.artists[0]?.name}</span><strong>{album.name}</strong><small>{album.release_date?.slice(0, 4) ?? "—"}</small></span>
          <span className={styles.caseEdge} />
        </span>;
        return copy ? <div key={`copy-${offset}`} {...props} aria-hidden="true">{content}</div>
          : <button key={album.id} {...props} ref={selected ? caseRef : undefined} type="button" disabled={disabled} tabIndex={mode === "open" && selected ? -1 : undefined} aria-disabled={mode === "open" && selected || undefined}
            data-testid={selected ? "artist-selected-case" : undefined} data-album-id={album.id}
            aria-label={selected ? `Abrir caja de ${album.name}` : `Seleccionar ${album.name}`} aria-pressed={selected}
            onClick={() => { if (selected) open(); else select(at); }}>{content}</button>;
      })}
    </div>
    {detailVisible && albums[index] && <ArtistInlineCase key={albums[index].id} expanded={mode === "open"} onClosed={closeDone} album={albums[index]} active={active} pending={Boolean(disabled)} hiddenDiscId={hiddenDiscId} discRef={discRef} onPlay={onPlay} />}
    <span className={styles.dragHint}>{mode === "browse" ? "ARRASTRÁ EL ESPACIO LIBRE · ELEGÍ UNA CAJA" : mode === "selected" ? "OTRO CLIC PARA ABRIR · ESC PARA RECORRER" : "CD: ARRASTRÁ PARA INSPECCIONAR · ESC PARA CERRAR"}</span>
  </div>;
}
