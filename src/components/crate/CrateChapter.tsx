"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { loadCollection, syncCollectionAuth, useCollectionCache } from "@/lib/collectionClient";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { CrateShelf } from "./CrateShelf";
import { bateaAlbums } from "@/lib/bateaAlbums";
import styles from "./CrateChapter.module.css";

export function CrateChapter() {
  const { stop, start } = useRailActions();
  const { openAlbum } = useAlbumDetailActions();
  const dragLockTokenRef = useRef(Symbol("crate-shelf-drag"));
  const chapterRef = useRef<HTMLDivElement>(null);
  const { authenticated } = useSpotifyPlayer();
  const { albums: cachedAlbums, collectionState, collectionError, collectionRetryAt } = useCollectionCache();
  const [isActiveChapter, setIsActiveChapter] = useState(false);
  const [now, setNow] = useState(Date.now);
  const retrySeconds = Math.max(0, Math.ceil((collectionRetryAt - now) / 1000));

  useEffect(() => { syncCollectionAuth(authenticated); }, [authenticated]);

  useEffect(() => { setNow(Date.now()); }, [collectionRetryAt]);
  useEffect(() => {
    if (!retrySeconds) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [retrySeconds]);

  useEffect(() => {
    return () => {
      start(dragLockTokenRef.current);
    };
  }, [start]);

  // Motion styling follows DOM attributes; settled activation also enables
  // the shared collection request without fetching while the rail passes by.
  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    if (!railRoot || !chapterRef.current) return;

    const sync = () => {
      const enabled =
        railRoot.dataset.chapter === "2" &&
        railRoot.dataset.railMoving !== "true";
      chapterRef.current?.setAttribute(
        "data-batea-animation-enabled",
        enabled ? "true" : "false",
      );
      setIsActiveChapter((current) => current === enabled ? current : enabled);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-chapter", "data-rail-moving"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isActiveChapter || authenticated !== true || cachedAlbums || collectionState !== "idle") return;
    void loadCollection(authenticated)?.catch(() => undefined);
  }, [isActiveChapter, authenticated, cachedAlbums, collectionState]);

  const albums = cachedAlbums ?? [];
  const loading = collectionState === "loading" || (collectionState === "idle" && !cachedAlbums && authenticated !== false);

  const handleGrabStart = useCallback(() => {
    stop(dragLockTokenRef.current);
  }, [stop]);

  const handleGrabEnd = useCallback(() => {
    start(dragLockTokenRef.current);
  }, [start]);

  const statusLabel =
    collectionState === "error"
      ? collectionError?.reason === "QUOTA_EXCEEDED" ? "SPOTIFY QUOTA EXCEEDED"
        : retrySeconds > 0 ? "RATE LIMITED / RETRY IN " + retrySeconds + "s" : "ARCHIVO NO DISPONIBLE"
      : loading
        ? "INDEXANDO..."
        : authenticated === false && !cachedAlbums ? "CONECTÁ SPOTIFY"
        : albums.length + " DISCS";

  return (
    <div
      ref={chapterRef}
      className={styles.chapter}
      data-batea-animation-enabled="false"
    >
      <header className={styles.header}>
        <div>
          <h2>LA BATEA</h2>
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </header>

      <div className={styles.shelfArea}>
        {collectionState === "error" ? (
          <div className={styles.emptyState} role="alert">
            <div>
              <p>{collectionError?.message}</p>
              <button type="button" disabled={retrySeconds > 0 || authenticated !== true} onClick={() => {
                setNow(Date.now());
                void loadCollection(authenticated)?.catch(() => undefined);
              }}>Reintentar archivo</button>
              {collectionError?.status === 401 && <a href="/api/auth/login"> Conectar Spotify</a>}
              {retrySeconds > 0 && <p>Reintento disponible en {retrySeconds} s.</p>}
            </div>
          </div>
        ) : loading ? (
          <div className={styles.emptyState} role="status">CARGANDO ARCHIVO...</div>
        ) : authenticated === false && !cachedAlbums ? (
          <div className={styles.emptyState} role="status"><p>Conectá Spotify para ver tus discos guardados. <a href="/api/auth/login">Conectar Spotify</a></p></div>
        ) : albums.length === 0 ? (
          <div className={styles.emptyState} role="status">ARCHIVO VACÍO</div>
        ) : (
          <CrateShelf
            albums={bateaAlbums(albums)}
            onSelect={openAlbum}
            onGrabStart={handleGrabStart}
            onGrabEnd={handleGrabEnd}
          />
        )}
      </div>

    </div>
  );
}
