"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import type { AlbumItem } from "@/types/crate";
import { bateaAlbums, BATEA_SHELF_COUNT } from "@/lib/bateaAlbums";
import { JewelCaseFront } from "./JewelCaseFront";
import styles from "./CollectionBateaTray.module.css";

interface CollectionBateaTrayProps {
  albums: AlbumItem[];
  open: boolean;
  overlay: boolean;
  suspended: boolean;
  authenticated: boolean | null;
  loading: boolean;
  error: string | null;
  needsAuthentication: boolean;
  retrySeconds: number;
  toggleRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onClose: () => void;
  onSelect: (album: AlbumItem) => void;
  onRetry: () => void;
}

export function CollectionBateaTray({ albums, open, overlay, suspended, authenticated, loading, error, needsAuthentication, retrySeconds, toggleRef, onToggle, onClose, onSelect, onRetry }: CollectionBateaTrayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLElement | null>(null);
  const wasSuspended = useRef(suspended);
  const shelf = bateaAlbums(albums);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  useLayoutEffect(() => {
    const resuming = wasSuspended.current && !suspended;
    wasSuspended.current = suspended;
    if (!resuming || !open) return;
    // The shared modal cleans up before the parent's DOM update removes inert.
    // Restore its exact tray source on the next frame, once it can take focus.
    const frame = requestAnimationFrame(() => {
      const source = sourceRef.current;
      sourceRef.current = null;
      if (!source?.isConnected || source.closest('[inert], [hidden], [aria-hidden="true"]') || document.documentElement.dataset.modalOpen === "true") return;
      source.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [suspended, open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (suspended) return;
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!overlay || event.key !== "Tab" || event.defaultPrevented) return;
    const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex='0']") ?? [])
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return <div className={styles.dock} data-batea-open={open} data-batea-overlay={overlay} inert={suspended ? true : undefined} aria-hidden={suspended ? true : undefined}>
    <button
      ref={toggleRef}
      type="button"
      className={styles.tab}
      aria-label={open ? "Ocultar Batea en Colección" : "Mostrar Batea en Colección"}
      aria-expanded={open}
      aria-controls="collection-batea"
      onClick={onToggle}
    ><span aria-hidden="true" className={styles.tabDirection}>{open ? "›" : "‹"}</span><span>BATEA</span></button>
    <aside
      ref={panelRef}
      id="collection-batea"
      className={styles.panel}
      data-testid="collection-batea-prototype"
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay && open && !suspended ? true : undefined}
      aria-labelledby="collection-batea-title"
      aria-describedby="collection-batea-description"
      hidden={!open}
      onKeyDown={handleKeyDown}
    >
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>TUS GUARDADOS</p><h3 id="collection-batea-title">Batea</h3></div>
        <button ref={closeRef} type="button" className={styles.close} aria-label="Cerrar Batea" onClick={onClose}>Cerrar <span aria-hidden="true">×</span></button>
      </header>
      <p id="collection-batea-description" className={styles.description}>Los mismos discos y el mismo orden de Batea.</p>
      <div className={styles.albums} data-lenis-prevent aria-label="Discos guardados en la Batea">
        {error ? <div className={styles.state} role="alert"><p>{error}</p><button type="button" disabled={retrySeconds > 0 || authenticated !== true} onClick={onRetry}>Reintentar archivo</button>{needsAuthentication && <a href="/api/auth/login">Conectar Spotify</a>}{retrySeconds > 0 && <p>Reintento disponible en {retrySeconds} s.</p>}</div>
          : loading ? <p className={styles.state} role="status">Cargando discos guardados…</p>
          : shelf.length ? shelf.map((album) => <JewelCaseFront key={album.id} album={album} presentation="collection" onSelect={(source) => { sourceRef.current = source; onSelect(album); }} />)
          : <p className={styles.state} role="status">{authenticated === false ? <>Conectá Spotify para ver tus discos guardados. <a href="/api/auth/login">Conectar Spotify</a></> : "La Batea está vacía."}</p>}
      </div>
      <p className={styles.note}>{albums.length > BATEA_SHELF_COUNT ? `Primeros ${BATEA_SHELF_COUNT} guardados, igual que la bandeja actual.` : "Elegí una caja para abrirla o reproducir el álbum."}</p>
    </aside>
  </div>;
}
