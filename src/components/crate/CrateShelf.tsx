"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useMarqueeBelt } from "@/hooks/useMarqueeBelt";
import { JewelSpine } from "./JewelSpine";
import { JewelFlyout } from "./JewelFlyout";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateShelf.module.css";

interface CrateShelfProps {
  albums: AlbumItem[];
  onSelect: (album: AlbumItem) => void;
}

const COPIES = 3;
const GAP = 8;
const MAX_PAGES = 6;

export function CrateShelf({ albums, onSelect }: CrateShelfProps) {
  const [hovering, setHovering] = useState(false);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const [length, setLength] = useState(0);
  const [hover, setHover] = useState<{
    album: AlbumItem;
    rect: DOMRect;
  } | null>(null);
  const firstCopyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (firstCopyRef.current)
        setLength(firstCopyRef.current.offsetWidth + GAP);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (firstCopyRef.current) ro.observe(firstCopyRef.current);
    return () => ro.disconnect();
  }, [albums.length]);

  const pages = Math.max(1, Math.min(MAX_PAGES, albums.length));

  const { containerRef, trackRef, isDragging, page, goTo, stepPage } =
    useMarqueeBelt({
      speed: 60,
      paused: !driftEnabled || hovering || albums.length === 0,
      length,
      pages,
    });

  if (albums.length === 0) return null;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.pageNav}>
          <button
            type="button"
            className={styles.chevBtn}
            onClick={() => stepPage(-1)}
            aria-label="Página anterior"
          >
            ◄
          </button>
          <span className={styles.pageLabel}>
            PAGE {String(page + 1).padStart(2, "0")}/
            {String(pages).padStart(2, "0")}
          </span>
          <button
            type="button"
            className={styles.chevBtn}
            onClick={() => stepPage(1)}
            aria-label="Página siguiente"
          >
            ►
          </button>
        </div>

        <button
          type="button"
          className={styles.beltToggle}
          onClick={() => setDriftEnabled((d) => !d)}
          aria-pressed={driftEnabled}
        >
          <span
            className={`${styles.beltDot} ${driftEnabled ? styles.beltDotOn : ""}`}
          />
          {driftEnabled ? "BELT ON" : "BELT PAUSED"}
        </button>
      </div>

      <div
        className={styles.stage}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => {
          setHovering(false);
          setHover(null);
        }}
      >
        <div
          ref={containerRef}
          className={`${styles.viewport} ${isDragging ? styles.dragging : ""}`}
        >
          <div ref={trackRef} className={styles.track}>
            {Array.from({ length: COPIES }).map((_, copy) => (
              <div
                key={copy}
                ref={copy === 0 ? firstCopyRef : undefined}
                className={styles.copy}
                style={{ gap: GAP }}
              >
                {albums.map((album, i) => (
                  <JewelSpine
                    key={`${copy}-${album.id}`}
                    title={album.name}
                    artist={album.artists.map((a) => a.name).join(", ")}
                    coverUrl={album.images[0]?.url || ""}
                    tilt={(i % 5) * 0.5 - 1}
                    onSelect={() => onSelect(album)}
                    onHover={(rect) => setHover(rect ? { album, rect } : null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.fadeLeft} />
        <div className={styles.fadeRight} />
      </div>

      <div
        className={styles.dots}
        role="tablist"
        aria-label="Páginas de la batea"
      >
        {Array.from({ length: pages }).map((_, p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={p === page}
            className={`${styles.dot} ${p === page ? styles.dotActive : ""}`}
            onClick={() => goTo(p)}
            aria-label={`Página ${p + 1}`}
          />
        ))}
      </div>

      {hover && (
        <JewelFlyout
          title={hover.album.name}
          artist={hover.album.artists.map((a) => a.name).join(", ")}
          coverUrl={hover.album.images[0]?.url || ""}
          year={hover.album.release_date?.slice(0, 4)}
          rect={hover.rect}
        />
      )}
    </div>
  );
}
