"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { bateaAlbums } from "@/lib/bateaAlbums";
import { loadCollection, useCollectionCache } from "@/lib/collectionClient";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { ArtistCrateShelf } from "./ArtistCrateShelf";
import control from "@/components/DeckTrackSelector.module.css";
import styles from "./DeckNextDiscs.module.css";

interface ToggleProps {
  open: boolean;
  disabled: boolean;
  panelId: string;
  buttonRef: Ref<HTMLButtonElement>;
  onToggle: () => void;
}

export function DeckNextListenButton({ open, disabled, panelId, buttonRef, onToggle }: ToggleProps) {
  return <div className={control.deck} data-deck-next-discs>
    <button ref={buttonRef} className={`${control.toggle} ${styles.toggle}`} type="button" aria-expanded={open} aria-disabled={disabled || undefined}
      aria-controls={panelId} onClick={onToggle}>
      <span className={control.toggleIcon} aria-hidden="true">
        <svg viewBox="0 0 18 18" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M2 4h12v9H2zm3 11h11V6M5 7h6M5 10h4" />
        </svg>
      </span>
      <span>Next listen</span>
      <svg className={control.chevron} aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" fill="none">
        <path d="M3 2.5 6.5 6 3 9.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  </div>;
}

interface ShelfProps {
  open: boolean;
  mounted: boolean;
  panelId: string;
  chapterIndex: number;
  currentAlbumId?: string;
}

export function DeckNextDiscs({ open, mounted, panelId, chapterIndex, currentAlbumId }: ShelfProps) {
  const { openAlbum } = useAlbumDetailActions();
  const { stop, start } = useRailActions();
  const lock = useRef(Symbol("next-listen-drag")).current;
  const grab = useCallback(() => stop(lock), [lock, stop]);
  const release = useCallback(() => start(lock), [lock, start]);
  const { albums, collectionState, collectionError, collectionRetryAt } = useCollectionCache();
  const [now, setNow] = useState(Date.now);
  const retryWait = Math.max(0, Math.ceil((collectionRetryAt - now) / 1000));

  useEffect(() => {
    if (open && collectionState === "idle" && !albums) void loadCollection(true)?.catch(() => undefined);
  }, [albums, collectionState, open]);

  useEffect(() => {
    if (!open || !retryWait) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [open, retryWait]);

  useEffect(() => {
    if (!open) release();
  }, [open, release]);

  const discs = useMemo(() => {
    const shelf = albums ? bateaAlbums(albums) : [];
    const currentIndex = shelf.findIndex((album) => album.id === currentAlbumId);
    return currentIndex < 0 ? shelf : [...shelf.slice(currentIndex + 1), ...shelf.slice(0, currentIndex)];
  }, [albums, currentAlbumId]);

  return <section className={styles.shelf} aria-label="Discos guardados para seguir escuchando" id={panelId}
    aria-hidden={!open} inert={!open} data-next-listen-panel data-open={open} data-lenis-prevent>
    {mounted && (discs.length ? <ArtistCrateShelf albums={discs} startAt="leading" onSelect={openAlbum}
      active={open} chapterIndex={chapterIndex} onGrabStart={grab} onGrabEnd={release} label="Páginas de Next listen" />
      : collectionState === "error" ? <div className={styles.message} role="alert">
        <p>{collectionError?.message ?? "No se pudieron cargar tus discos."}</p>
        {collectionError?.status === 401 ? <a href="/api/auth/login">Conectar Spotify</a> :
          <button type="button" onClick={() => { setNow(Date.now()); void loadCollection(true)?.catch(() => undefined); }} disabled={retryWait > 0}>
            {retryWait > 0 ? `Reintentar en ${retryWait} s` : "Reintentar"}
          </button>}
      </div>
      : <p className={styles.message} role="status">{albums ? "No hay más discos guardados." : "Cargando tus discos…"}</p>)}
  </section>;
}
