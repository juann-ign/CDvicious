"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { useDiscSurfaceDrag } from "@/hooks/useDiscSurfaceDrag";
import type { ArtistRelease } from "@/types/artist";
import type { AlbumTrack } from "@/types/crate";
import { CatalogDiscFace } from "./CatalogDiscSurface";
import styles from "./ArtistJewelCaseDetail.module.css";

type ReleaseMeta = { label?: string; catalogNumber?: string; format?: string; country?: string };
interface Props {
  album: ArtistRelease;
  active: boolean;
  pending: boolean;
  hiddenDiscId?: string;
  discRef: RefObject<HTMLButtonElement | null>;
  onPlay?: (album: ArtistRelease, origin: HTMLElement) => void;
}

function duration(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// The detail shares track and release endpoints with JewelCaseDetailModal, but
// owns only its CD gesture. Opening the case never locks chapter navigation.
export function ArtistJewelCaseDetail({ album, active, pending, hiddenDiscId, discRef }: Props) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [tracksError, setTracksError] = useState(false);
  const [meta, setMeta] = useState<ReleaseMeta>({});
  const [reverse, setReverse] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const { rotation, cancel: cancelDiscGesture, pointerHandlers } = useDiscSurfaceDrag(!active || pending);
  const { start, stop } = useRailActions();
  const token = useRef(Symbol("artist-inline-disc"));
  const pointer = useRef<{ id: number; surface: HTMLElement } | null>(null);
  const moved = useRef(false);
  const startX = useRef(0);
  const suppressClick = useRef(false);
  const release = useCallback((cancelled = true) => {
    const gesture = pointer.current;
    pointer.current = null;
    start(token.current);
    if (cancelled) cancelDiscGesture();
    if (gesture?.surface.hasPointerCapture(gesture.id)) gesture.surface.releasePointerCapture(gesture.id);
  }, [start, cancelDiscGesture]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setTracks(null); setTracksError(false); setMeta({}); setReverse(false); setInspecting(false);
    void fetch(`/api/album/${encodeURIComponent(album.id)}/tracks`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("tracks"); return response.json(); })
      .then((data: { tracks?: AlbumTrack[] }) => { if (!cancelled) setTracks(data.tracks ?? []); })
      .catch(() => { if (!cancelled) { setTracks([]); setTracksError(true); } });
    // Demo metadata is already explicit on the album. Do not substitute the
    // endpoint's generic mock release year or manufacture a booklet.
    if (album.artworkSource !== "demo") {
      const query = new URLSearchParams({ artist: album.artists.map((artist) => artist.name).join(", "), album: album.name });
      void fetch(`/api/album/${encodeURIComponent(album.id)}/release-meta?${query}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : null)
        .then((data: ReleaseMeta | null) => { if (!cancelled && data) setMeta(data); })
        .catch(() => undefined);
    }
    return () => { cancelled = true; controller.abort(); };
  }, [album.id, album.name, album.artists, album.artworkSource]);

  useEffect(() => {
    const finish = (event: Event) => {
      if (event instanceof PointerEvent && pointer.current && event.pointerId !== pointer.current.id) return;
      if (pointer.current) suppressClick.current = moved.current;
      release(event.type !== "pointerup");
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
  useEffect(() => { if (!active || pending) release(); }, [active, pending, release]);

  return <div className={styles.openCase} data-testid="artist-inline-case" data-album-id={album.id} data-gesture-owner="detail" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <section className={styles.booklet} aria-label={`Contenido de ${album.name}`}>
      <div className={styles.bookletHeading}>
        <span className={styles.micro}>CONTENIDO DEL DISCO</span>
        <h3 title={album.name}>{album.name}</h3>
        <p>{album.release_date ? `EDICIÓN · ${album.release_date.slice(0, 4)}` : "FECHA DE EDICIÓN NO DISPONIBLE"}</p>
      </div>
      <div className={styles.tracklist} tabIndex={0} aria-label="Lista de pistas">
        {tracks === null ? <p role="status">LEYENDO PISTAS…</p> : tracksError ? <p role="status">No se pudo cargar la lista de pistas.</p> : tracks.length ? <ol>{tracks.map((track, index) => <li key={`${index}:${track.name}`}>
          <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span><span className={styles.trackTitle} title={track.name}>{track.name}</span><time>{duration(track.duration_ms)}</time>
        </li>)}</ol> : <p>LISTA DE PISTAS NO DISPONIBLE</p>}
      </div>
      <div className={styles.bookletFooter}>
        {(meta.label || album.label) && <p title={meta.label || album.label}>{meta.label || album.label}</p>}
        {(meta.catalogNumber || meta.country) && <p>{[meta.catalogNumber, meta.country].filter(Boolean).join(" · ")}</p>}
        <span>{album.artworkSource === "demo" ? "DEMO · PISTAS FICTICIAS" : "BOOKLET ORIGINAL NO DISPONIBLE"}</span>
      </div>
    </section>
    <section className={styles.tray} aria-label="Bandeja del CD" data-inspecting={inspecting}>
      <span className={styles.trayMark}>CDV / COMPACT DISC</span>
      <div className={styles.recess}>
        <div className={styles.discSurface} data-gesture-owner="disc" data-dragging={Boolean(pointer.current)}
          onPointerDown={(event) => {
            if (!active || pending || event.button !== 0 || pointer.current) return;
            moved.current = false; suppressClick.current = false; startX.current = event.clientX;
            const surface = discRef.current ?? event.currentTarget;
            pointer.current = { id: event.pointerId, surface };
            stop(token.current);
            surface.setPointerCapture(event.pointerId);
            pointerHandlers.onPointerDown(event);
          }}
          onPointerMove={(event) => { if (pointer.current?.id === event.pointerId && Math.abs(event.clientX - startX.current) > 6) moved.current = true; }}
          onPointerCancel={() => { suppressClick.current = moved.current; release(); }}
          onLostPointerCapture={() => { if (pointer.current) { suppressClick.current = moved.current; release(); } }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.stopPropagation(); pointerHandlers.onKeyDown(event); }
          }}>
          <button ref={discRef} type="button" className={styles.disc} data-testid="artist-case-cd" data-album-id={album.id} data-flipped={reverse}
            aria-label={`Inspeccionar CD de ${album.name}`} aria-pressed={inspecting} disabled={pending || !active}
            style={{ "--inspection-rotation": `${rotation}deg`, visibility: hiddenDiscId === album.id ? "hidden" : undefined } as CSSProperties}
            onClick={(event) => { if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } setInspecting((value) => !value); }}>
            <CatalogDiscFace name={album.name} year={album.release_date?.slice(0, 4)} reverse={reverse} demoArtworkUrl={album.artworkSource === "demo" ? album.images[0]?.url : undefined} />
          </button>
        </div>
        <span className={styles.spindle} aria-hidden="true" />
      </div>
      <div className={styles.discControls}><span>ARRASTRÁ EL CD · ← →</span><button type="button" onClick={() => setReverse((value) => !value)} aria-pressed={reverse} disabled={pending || !active}>GIRAR CD</button></div>
    </section>
  </div>;
}
