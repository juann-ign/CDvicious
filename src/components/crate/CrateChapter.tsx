"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { useCollectionCache } from "@/lib/collectionClient";
import {
  JewelCaseDetailModal,
  type StartPlayExecution,
} from "./JewelCaseDetailModal";
import { RailFlyingDisc } from "./RailFlyingDisc";
import { CrateShelf } from "./CrateShelf";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateChapter.module.css";

const SHELF_COUNT = 18;

export function CrateChapter() {
  const { stop, start, scrollToChapter } = useRailActions();
  const dragLockTokenRef = useRef(Symbol("crate-shelf-drag"));
  const chapterRef = useRef<HTMLDivElement>(null);
  const { albums: cachedAlbums } = useCollectionCache();

  useEffect(() => {
    return () => {
      start(dragLockTokenRef.current);
    };
  }, [start]);

  // Drive motion styling through DOM attributes; don't re-render all shelf
  // spines each time a rail gesture starts or settles.
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
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-chapter", "data-rail-moving"],
    });
    return () => observer.disconnect();
  }, []);
  const albums = cachedAlbums ?? [];
  const [loading] = useState(false);
  const [rateLimitSeconds] = useState<number | null>(null);
  const [quotaExceeded] = useState(false);
  const [selected, setSelected] = useState<AlbumItem | null>(null);
  const [playErrorForAlbum, setPlayErrorForAlbum] = useState<{
    albumId: string;
    message: string;
  } | null>(null);
  const [flight, setFlight] = useState<{
    album: AlbumItem;
    originRect: DOMRect;
  } | null>(null);

  const handleGrabStart = useCallback(() => {
    stop(dragLockTokenRef.current);
  }, [stop]);

  const handleGrabEnd = useCallback(() => {
    start(dragLockTokenRef.current);
  }, [start]);

  const handleSelect = useCallback((album: AlbumItem) => {
    setPlayErrorForAlbum(null);
    setSelected(album);
  }, []);

  const handleClose = useCallback(() => {
    setSelected(null);
    setPlayErrorForAlbum(null);
  }, []);

  const handleLoad = useCallback(() => {
    setSelected(null);
    setPlayErrorForAlbum(null);
  }, []);

  const handlePlay = useCallback((
    album: AlbumItem,
    originEl: HTMLElement,
    executePlayback: StartPlayExecution,
  ) => {
    const sourceChapter = Number(document.documentElement.dataset.chapter ?? "0");

    setPlayErrorForAlbum(null);
    setFlight({
      album,
      originRect: originEl.getBoundingClientRect(),
    });
    setSelected(null);

    // Playback executes while the disc is in transit. On rejection, cancel the
    // transient flight, return to the source chapter, and restore modal feedback.
    void executePlayback()
      .then((result) => {
        if (result.success) return;

        window.dispatchEvent(new Event("cdvicious:disc-flight-cancelled"));
        setFlight(null);
        setPlayErrorForAlbum({
          albumId: album.id,
          message: result.message ?? "Spotify no confirmó la reproducción. Podés intentarlo de nuevo.",
        });
        // Restore navigation before remounting the modal: its layout effect
        // acquires a Lenis stop token, which would make scrollToChapter a no-op.
        // The flight state is already cleared, so this frame runs after the disc
        // has unmounted and before the recovery modal locks the rail again.
        window.requestAnimationFrame(() => {
          scrollToChapter(sourceChapter, 0);
          setSelected(album);
        });
      })
      .catch(() => {
        window.dispatchEvent(new Event("cdvicious:disc-flight-cancelled"));
        setFlight(null);
        setPlayErrorForAlbum({
          albumId: album.id,
          message: "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.",
        });
        // Restore navigation before remounting the modal: its layout effect
        // acquires a Lenis stop token, which would make scrollToChapter a no-op.
        // The flight state is already cleared, so this frame runs after the disc
        // has unmounted and before the recovery modal locks the rail again.
        window.requestAnimationFrame(() => {
          scrollToChapter(sourceChapter, 0);
          setSelected(album);
        });
      });
  }, [scrollToChapter]);

  const handleFlightArrive = useCallback(() => {
    window.dispatchEvent(new Event("cdvicious:disc-flight-arrived"));
  }, []);

  const handleFlightDone = useCallback(() => {
    window.dispatchEvent(new Event("cdvicious:disc-flight-done"));
    setFlight(null);
  }, []);

  const statusLabel =
    quotaExceeded
      ? "SPOTIFY QUOTA EXCEEDED"
      : rateLimitSeconds !== null
        ? "RATE LIMITED / RETRY IN " + rateLimitSeconds + "s"
        : loading
        ? "INDEXANDO..."
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
        {loading ? (
          <div className={styles.emptyState}>CARGANDO ARCHIVO...</div>
        ) : albums.length === 0 ? (
          <div className={styles.emptyState}>ARCHIVO VACÍO</div>
        ) : (
          <CrateShelf
            albums={albums.slice(0, SHELF_COUNT)}
            onSelect={handleSelect}
            onGrabStart={handleGrabStart}
            onGrabEnd={handleGrabEnd}
          />
        )}
      </div>

      {selected && (
        <JewelCaseDetailModal
          album={selected}
          onClose={handleClose}
          onLoad={handleLoad}
          initialPlayError={
            playErrorForAlbum?.albumId === selected.id
              ? playErrorForAlbum.message
              : null
          }
          onPlay={(originEl, executePlayback) =>
            handlePlay(selected, originEl, executePlayback)
          }
        />
      )}

      {flight && (
        <RailFlyingDisc
          coverUrl={flight.album.images[0]?.url ?? ""}
          originRect={flight.originRect}
          onArrive={handleFlightArrive}
          onDone={handleFlightDone}
        />
      )}
    </div>
  );
}
