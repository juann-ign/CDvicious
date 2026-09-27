"use client";

import { useCallback, useEffect, useState } from "react";
import { CrateShelf } from "./CrateShelf";
import { CollectionOverlay } from "./CollectionOverlay";
import { JewelCaseDetailModal } from "./JewelCaseDetailModal";
import { FlyingDisc } from "./FlyingDisc";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateTeaser.module.css";

const TEASER_COUNT = 18;

interface CrateTeaserProps {
  onLoadAlbum: (album: AlbumItem) => void;
}

export function CrateTeaser({ onLoadAlbum }: CrateTeaserProps) {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selected, setSelected] = useState<AlbumItem | null>(null);
  const [flight, setFlight] = useState<{ album: AlbumItem; rect: DOMRect } | null>(null);

  useEffect(() => {
    fetch("/api/collection")
      .then((res) => res.json())
      .then((data) => Array.isArray(data) && setAlbums(data))
      .finally(() => setLoading(false));
  }, []);

  const handleLoad = useCallback((album: AlbumItem, originEl: HTMLElement) => {
    const rect = originEl.getBoundingClientRect();
    setSelected(null);
    setOverlayOpen(false);
    setFlight({ album, rect });
  }, []);

  const handleFlightArrive = useCallback(() => {
    if (!flight) return;
    onLoadAlbum(flight.album);
  }, [flight, onLoadAlbum]);

  const handleFlightDone = useCallback(() => {
    setFlight(null);
  }, []);

  const teaserAlbums = albums.slice(0, TEASER_COUNT);

  return (
    <section className={styles.section} data-crate-teaser>
      <div className={styles.header}>
        <span className={styles.label}>LA BATEA</span>
        <button type="button" className={styles.openBtn} onClick={() => setOverlayOpen(true)}>
          ABRIR COLECCIÓN ▸
        </button>
      </div>

      {!loading && teaserAlbums.length > 0 && (
        <CrateShelf albums={teaserAlbums} onSelect={setSelected} />
      )}

      {selected && !overlayOpen && (
        <JewelCaseDetailModal
          album={selected}
          onClose={() => setSelected(null)}
          onLoad={(el) => handleLoad(selected, el)}
        />
      )}

      {overlayOpen && (
        <CollectionOverlay
          albums={albums}
          onClose={() => setOverlayOpen(false)}
          onLoadAlbum={handleLoad}
        />
      )}

      {flight && (
        <FlyingDisc
          coverUrl={flight.album.images[0]?.url || ""}
          originRect={flight.rect}
          onArrive={handleFlightArrive}
          onDone={handleFlightDone}
        />
      )}
    </section>
  );
}
