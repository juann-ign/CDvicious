"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArtistDiscScene, type CaseMode } from "./ArtistDiscScene";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { useArtistCatalog } from "@/hooks/useArtistCatalog";
import type { ArtistItem, ArtistRelease } from "@/types/artist";
import { compareArtistEditions } from "@/lib/artistCaseLayout";
import styles from "./ArtistDiscography.module.css";

type Position = { id?: string; index: number; mode: CaseMode };
interface Props {
  artist: ArtistItem;
  active: boolean;
  settled: boolean;
  onResults: () => void;
  onCollection: () => void;
}
export function ArtistDiscographyView({ artist, active, settled, onResults, onCollection }: Props) {
  const { openAlbum } = useAlbumDetailActions();
  const catalog = useArtistCatalog(artist.id, "album", active && settled);
  const albums = useMemo(() => [...catalog.items].sort(compareArtistEditions), [catalog.items]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const position = positions[artist.id] ?? { index: 0, mode: "browse" as const };
  const found = position.id ? albums.findIndex((album) => album.id === position.id) : -1;
  const index = Math.max(0, Math.min(found >= 0 ? found : position.index, albums.length - 1));
  const album = albums[index];
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
    const safe = Math.max(0, Math.min(next, albums.length - 1));
    setPositions((all) => ({ ...all, [artist.id]: { index: safe, id: albums[safe]?.id, mode: "selected" } }));
  };
  const changeMode = useCallback((mode: CaseMode) => {
    setPositions((all) => ({ ...all, [artist.id]: { index, id: album?.id, mode } }));
  }, [artist.id, index, album?.id]);
  const escape = useCallback(() => {
    changeMode("browse");
    requestAnimationFrame(() => {
      viewRef.current?.querySelector<HTMLElement>('[data-testid="artist-disc-scene"]')?.focus({ preventScroll: true });
    });
  }, [changeMode]);
  const showAlbum = (release: ArtistRelease, origin: HTMLElement) => {
    const next = albums.findIndex(({ id }) => id === release.id);
    if (next < 0) return;
    select(next);
    openAlbum(release, origin);
  };
  const escapeRef = useRef(escape);
  const modeRef = useRef(position.mode);
  escapeRef.current = escape;
  modeRef.current = position.mode;
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || modeRef.current === "browse" ||
        document.querySelector('[data-album-detail-open="true"]')) return;
      event.preventDefault(); escapeRef.current();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active]);
  const previousActive = useRef(active);
  useEffect(() => {
    if (active && !previousActive.current && album && position.mode !== "browse") {
      caseRef.current?.focus({ preventScroll: true });
    }
    previousActive.current = active;
  }, [active, album, position.mode]);

  return <div ref={viewRef} className={styles.view} data-testid="artist-discography" data-artist-id={artist.id} data-mode={position.mode}>
    <header className={styles.header}>
      <div className={styles.breadcrumb}><button onClick={onResults}>← VOLVER A RESULTADOS</button><button onClick={onCollection}>TU COLECCIÓN ↗</button></div>
      <div className={styles.artistHeading}><div><span className={styles.eyebrow}>COLECCIÓN / ARCHIVO DE ARTISTA</span><h2>{artist.name}</h2><p className={styles.chronology}>DISCOGRAFÍA · ÁLBUMES · ORDEN CRONOLÓGICO ↑</p></div><span className={styles.catalogCount} role="status">{albums.length} {catalog.nextOffset !== null ? `/ ${catalog.total || "…"} CARGADOS` : "LANZAMIENTOS"}{catalog.loading ? <small>CONSULTANDO CATÁLOGO…</small> : catalog.error && <small>CATÁLOGO INCOMPLETO</small>}</span></div>
    </header>
    {catalog.error && <div className={styles.error} role="alert">{catalog.error.message} <button onClick={catalog.retry}>REINTENTAR</button>{catalog.error.status === 401 && <a href="/api/auth/login">CONECTAR SPOTIFY</a>}</div>}
    {album ? <>
      <div className={styles.sceneFrame}>
        <ArtistDiscScene albums={albums} index={index} mode={position.mode} active={active && visible} drifting={!paused && !reducedMotion && settled} select={select}
          advance={() => { const next = (index + 1) % albums.length; setPositions((all) => ({ ...all, [artist.id]: { index: next, id: albums[next]?.id, mode: "browse" } })); }}
          openAlbum={showAlbum} escape={escape} caseRef={caseRef} />
      </div>
      <footer className={styles.catalogFooter}>
        <div className={styles.exploredInfo} aria-live="polite">
          {position.mode === "browse" ? <div><span className={styles.infoLabel}>ARCHIVO EN MOVIMIENTO</span><h3>Una historia, disco a disco.</h3><p>Elegí un lomo para acercarte al álbum.</p></div> : <>
            {album.artworkSource !== "demo" && album.images[0] && <a href={album.external_urls?.spotify ?? `https://open.spotify.com/album/${album.id}`} target="_blank" rel="noreferrer"><Image src={album.images[0].url} alt={`Portada de ${album.name}`} className={styles.intactArtwork} width={52} height={52} unoptimized /></a>}
            <div><span className={styles.infoLabel}>ÁLBUM EXPLORADO / {String(index + 1).padStart(2, "0")}</span><h3 title={album.name}>{album.name}</h3><p>FECHA DE EDICIÓN: {album.release_date ?? "NO DISPONIBLE"}</p></div>
          </>}
        </div>
        <div className={styles.catalogNavigation}><div className={styles.transport}>
          <button onClick={() => select(index - 1)} disabled={index === 0}>◁ ANTERIOR</button>
          <button onClick={() => { if (position.mode !== "browse") changeMode("browse"); setPaused(position.mode === "browse" ? !paused : false); }} disabled={reducedMotion} aria-pressed={paused || reducedMotion}>{paused || reducedMotion || position.mode !== "browse" ? "REANUDAR RECORRIDO" : "PAUSAR RECORRIDO"}</button>
          <button onClick={() => select(index + 1)} disabled={index === albums.length - 1}>SIGUIENTE ▷</button>
        </div><input type="range" aria-label="Posición en la discografía" min={1} max={albums.length} value={index + 1} onChange={(event) => select(Number(event.target.value) - 1)} /><span className={styles.position}>{String(index + 1).padStart(2, "0")} / {albums.length}</span></div>
        <div className={styles.consoleMeta}><span>{reducedMotion ? "MOVIMIENTO REDUCIDO · NAVEGACIÓN MANUAL" : "ARRASTRE LATERAL · TECLADO ← → · ESC VOLVER"}</span>{album.artworkSource === "demo" ? <span>DEMO · ARTE PROPIO / LANZAMIENTOS FICTICIOS</span> : <a href={`https://open.spotify.com/artist/${artist.id}`} target="_blank" rel="noreferrer"><Image src="/images/spotify-logo.svg" alt="Spotify" width={72} height={22} />ABRIR SPOTIFY ↗ · PORTADA ESTÁTICA / CAJA NEUTRA</a>}</div>
      </footer>
    </> : <div className={styles.empty} role="status">{catalog.loading ? "LEYENDO DISCOGRAFÍA…" : catalog.error ? "CATÁLOGO NO DISPONIBLE" : "ESTE ARTISTA NO TIENE LANZAMIENTOS EN ESTA CATEGORÍA"}</div>}
  </div>;
}
