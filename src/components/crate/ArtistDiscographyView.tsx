"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArtistDiscScene, type CaseMode } from "./ArtistDiscScene";
import { useArtistCatalog } from "@/hooks/useArtistCatalog";
import type { ArtistItem, ArtistRelease } from "@/types/artist";
import styles from "./ArtistDiscography.module.css";

type Position = { id?: string; index: number; mode: CaseMode };
interface Props {
  artist: ArtistItem;
  active: boolean;
  settled: boolean;
  onResults: () => void;
  onCollection: () => void;
  onPlay: (album: ArtistRelease, element: HTMLElement) => void;
  pending: boolean;
  hiddenDiscId?: string;
  playError: string | null;
}
export function ArtistDiscographyView({ artist, active, settled, onResults, onCollection, onPlay, pending, hiddenDiscId, playError }: Props) {
  const catalog = useArtistCatalog(artist.id, "album", active && settled);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const position = positions[artist.id] ?? { index: 0, mode: "browse" as const };
  const found = position.id ? catalog.items.findIndex((album) => album.id === position.id) : -1;
  const index = Math.max(0, Math.min(found >= 0 ? found : position.index, catalog.items.length - 1));
  const album = catalog.items[index];
  const discRef = useRef<HTMLButtonElement>(null);
  const caseRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setVisible(document.visibilityState === "visible");
    updateMotion(); updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => { media.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updateVisibility); };
  }, []);
  useEffect(() => {
    if (!album || position.id) return;
    setPositions((all) => ({ ...all, [artist.id]: { index, id: album.id, mode: "browse" } }));
  }, [album, artist.id, index, position.id]);
  const select = (next: number) => {
    if (pending) return;
    const safe = Math.max(0, Math.min(next, catalog.items.length - 1));
    setPositions((all) => ({ ...all, [artist.id]: { index: safe, id: catalog.items[safe]?.id, mode: "selected" } }));
  };
  const changeMode = useCallback((mode: CaseMode) => {
    if (pending) return;
    setPositions((all) => ({ ...all, [artist.id]: { index, id: album?.id, mode } }));
  }, [pending, artist.id, index, album?.id]);
  const escape = useCallback(() => {
    changeMode(position.mode === "open" ? "selected" : "browse");
    requestAnimationFrame(() => {
      if (position.mode === "open") caseRef.current?.focus({ preventScroll: true });
      else viewRef.current?.querySelector<HTMLElement>('[data-testid="artist-disc-scene"]')?.focus({ preventScroll: true });
    });
  }, [changeMode, position.mode]);
  const escapeRef = useRef(escape);
  const modeRef = useRef(position.mode);
  escapeRef.current = escape;
  modeRef.current = position.mode;
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || modeRef.current === "browse") return;
      event.preventDefault(); escapeRef.current();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active]);
  const previousActive = useRef(active);
  useEffect(() => {
    if (active && !previousActive.current && album && position.mode !== "browse") {
      (position.mode === "open" ? discRef.current : caseRef.current)?.focus({ preventScroll: true });
    }
    previousActive.current = active;
  }, [active, album, position.mode]);

  return <div ref={viewRef} className={styles.view} data-testid="artist-discography" data-artist-id={artist.id} data-mode={position.mode}>
    <header className={styles.header}>
      <div className={styles.breadcrumb}><button onClick={() => { if (position.mode === "open") changeMode("selected"); onResults(); }} disabled={pending}>← VOLVER A RESULTADOS</button><button onClick={() => { if (position.mode === "open") changeMode("selected"); onCollection(); }} disabled={pending}>TU COLECCIÓN ↗</button></div>
      <div className={styles.artistHeading}><div><span className={styles.eyebrow}>COLECCIÓN / ARCHIVO DE ARTISTA</span><h2>{artist.name}</h2><p className={styles.chronology}>DISCOGRAFÍA · ÁLBUMES · ORDEN CRONOLÓGICO ↑</p></div><span className={styles.catalogCount} role="status">{catalog.items.length} {catalog.nextOffset !== null ? `/ ${catalog.total || "…"} CARGADOS` : "LANZAMIENTOS"}{catalog.loading ? <small>CONSULTANDO CATÁLOGO…</small> : catalog.error && <small>CATÁLOGO INCOMPLETO</small>}</span></div>
    </header>
    {catalog.error && <div className={styles.error} role="alert">{catalog.error.message} <button onClick={catalog.retry}>REINTENTAR</button>{catalog.error.status === 401 && <a href="/api/auth/login">CONECTAR SPOTIFY</a>}</div>}
    {album ? <>
      <div className={styles.sceneFrame}>
        <ArtistDiscScene albums={catalog.items} index={index} mode={position.mode} active={active && visible} drifting={!paused && !reducedMotion && settled} select={select}
          advance={() => { const next = (index + 1) % catalog.items.length; setPositions((all) => ({ ...all, [artist.id]: { index: next, id: catalog.items[next]?.id, mode: "browse" } })); }}
          open={() => changeMode("open")} escape={escape} discRef={discRef} caseRef={caseRef} hiddenDiscId={hiddenDiscId} disabled={pending} onPlay={onPlay} />
      </div>
      <footer className={styles.catalogFooter}>
        <div className={styles.exploredInfo} aria-live="polite">
          {position.mode === "browse" ? <div><span className={styles.infoLabel}>ARCHIVO EN MOVIMIENTO</span><h3>Una historia, disco a disco.</h3><p>Elegí un lomo para acercarte al álbum.</p></div> : <>
            {album.artworkSource !== "demo" && album.images[0] && <a href={album.external_urls?.spotify ?? `https://open.spotify.com/album/${album.id}`} target="_blank" rel="noreferrer"><Image src={album.images[0].url} alt={`Portada de ${album.name}`} className={styles.intactArtwork} width={52} height={52} unoptimized /></a>}
            <div><span className={styles.infoLabel}>ÁLBUM EXPLORADO / {String(index + 1).padStart(2, "0")}</span><h3 title={album.name}>{album.name}</h3><p>FECHA DE EDICIÓN: {album.release_date ?? "NO DISPONIBLE"}</p></div>
          </>}
          <div className={styles.caseActions}>
            {position.mode !== "browse" && <><button onClick={() => position.mode === "open" ? escape() : changeMode("open")} disabled={pending}>{position.mode === "open" ? "CERRAR CAJA" : "ABRIR CAJA"}</button><button className={styles.play} onClick={() => { const origin = position.mode === "open" ? discRef.current : caseRef.current; if (origin) onPlay(album, origin); }} disabled={pending}>{pending ? "ESPERANDO SPOTIFY…" : "REPRODUCIR DISCO ↗"}</button></>}
          </div>
        </div>
        <div className={styles.catalogNavigation}><div className={styles.transport}>
          <button onClick={() => select(index - 1)} disabled={pending || index === 0}>◁ ANTERIOR</button>
          <button onClick={() => { if (position.mode !== "browse") changeMode("browse"); setPaused(position.mode === "browse" ? !paused : false); }} disabled={pending || reducedMotion} aria-pressed={paused || reducedMotion}>{paused || reducedMotion || position.mode !== "browse" ? "REANUDAR RECORRIDO" : "PAUSAR RECORRIDO"}</button>
          <button onClick={() => select(index + 1)} disabled={pending || index === catalog.items.length - 1}>SIGUIENTE ▷</button>
        </div><input type="range" aria-label="Posición en la discografía" min={1} max={catalog.items.length} value={index + 1} disabled={pending} onChange={(event) => select(Number(event.target.value) - 1)} /><span className={styles.position}>{String(index + 1).padStart(2, "0")} / {catalog.items.length}</span></div>
        <div className={styles.consoleMeta}><span>{reducedMotion ? "MOVIMIENTO REDUCIDO · NAVEGACIÓN MANUAL" : "ARRASTRE LATERAL · TECLADO ← → · ESC VOLVER"}</span>{album.artworkSource === "demo" ? <span>DEMO · ARTE PROPIO / LANZAMIENTOS FICTICIOS</span> : <a href={`https://open.spotify.com/artist/${artist.id}`} target="_blank" rel="noreferrer"><Image src="/images/spotify-logo.svg" alt="Spotify" width={72} height={22} />ABRIR SPOTIFY ↗ · PORTADA ESTÁTICA / CAJA NEUTRA</a>}</div>
      </footer>
    </> : <div className={styles.empty} role="status">{catalog.loading ? "LEYENDO DISCOGRAFÍA…" : catalog.error ? "CATÁLOGO NO DISPONIBLE" : "ESTE ARTISTA NO TIENE LANZAMIENTOS EN ESTA CATEGORÍA"}</div>}
    {playError && <div className={styles.error} role="alert">{playError} Podés volver a reproducir el disco para reintentar.</div>}
  </div>;
}
