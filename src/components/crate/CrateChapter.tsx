"use client";

import { useCallback, useEffect, useState } from "react";
import { useRail } from "@/components/scroll/RailContext";
import { JewelCaseDetailModal } from "./JewelCaseDetailModal";
import { RailFlyingDisc } from "./RailFlyingDisc";
import { CrateShelf } from "./CrateShelf";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateChapter.module.css";

const SHELF_COUNT = 18;

export function CrateChapter() {
  const { stop, start } = useRail();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AlbumItem | null>(null);
  const [flight, setFlight] = useState<{
    album: AlbumItem;
    originRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/collection?includeGenres=0")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setAlbums(data);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGrabStart = useCallback(() => {
    stop();
  }, [stop]);

  const handleGrabEnd = useCallback(() => {
    start();
  }, [start]);

  const handleSelect = useCallback((album: AlbumItem) => {
    setSelected(album);
  }, []);

  const handlePlay = useCallback((album: AlbumItem, originEl: HTMLElement) => {
    setFlight({
      album,
      originRect: originEl.getBoundingClientRect(),
    });
    setSelected(null);
  }, []);

  const handleFlightArrive = useCallback(() => {}, []);

  const handleFlightDone = useCallback(() => {
    setFlight(null);
  }, []);

  const statusLabel = loading ? "INDEXANDO..." : albums.length + " DISCS";

  return (
    <div className={styles.chapter}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CAP.03 / EPIC C</span>
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
          onClose={() => setSelected(null)}
          onLoad={() => setSelected(null)}
          onPlay={(originEl) => handlePlay(selected, originEl)}
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
