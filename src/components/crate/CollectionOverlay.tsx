"use client";

import { useEffect, useMemo, useState } from "react";
import { JewelCaseFront } from "./JewelCaseFront";
import { JewelCaseDetailModal } from "./JewelCaseDetailModal";
import type { AlbumItem } from "@/types/crate";
import styles from "./CollectionOverlay.module.css";

type DecadeFilter = "all" | "2020s" | "2010s" | "older";

const DECADES: { id: DecadeFilter; label: string }[] = [
  { id: "all", label: "TODAS" },
  { id: "2020s", label: "2020s" },
  { id: "2010s", label: "2010s" },
  { id: "older", label: "ARCHIVO" },
];

const COLUMNS = 10;
const ROWS = 4;
const PAGE_SIZE = COLUMNS * ROWS;
const TOP_GENRES_COUNT = 10;

function decadeOf(album: AlbumItem): DecadeFilter {
  const year = Number(album.release_date?.slice(0, 4));
  if (!year) return "older";
  if (year >= 2020) return "2020s";
  if (year >= 2010) return "2010s";
  return "older";
}

interface CollectionOverlayProps {
  albums: AlbumItem[];
  onClose: () => void;
  onLoadAlbum: (album: AlbumItem, originEl: HTMLElement) => void;
}

export function CollectionOverlay({
  albums,
  onClose,
  onLoadAlbum,
}: CollectionOverlayProps) {
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState<DecadeFilter>("all");
  const [genre, setGenre] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AlbumItem | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && !selected && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, selected]);

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const album of albums) {
      for (const g of album.genres ?? []) {
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_GENRES_COUNT)
      .map(([g]) => g);
  }, [albums]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return albums.filter((album) => {
      const matchesQuery =
        q === "" ||
        album.name.toLowerCase().includes(q) ||
        album.artists.some((a) => a.name.toLowerCase().includes(q));
      const matchesDecade = decade === "all" || decadeOf(album) === decade;
      const matchesGenre =
        genre === "all" || (album.genres ?? []).includes(genre);
      return matchesQuery && matchesDecade && matchesGenre;
    });
  }, [albums, query, decade, genre]);

  useEffect(() => setPage(0), [query, decade, genre]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(
    page * PAGE_SIZE,
    page * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Colección completa"
    >
      <button
        type="button"
        className={styles.scrim}
        onClick={onClose}
        aria-label="Cerrar"
      />

      <div className={styles.panel}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ARCHIVO / BATEA COMPLETA</p>
            <h2 className={styles.title}>LA COLECCIÓN</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            CERRAR ✕
          </button>
        </header>

        <div className={styles.filters}>
          <input
            type="text"
            className={styles.search}
            placeholder="BUSCAR ARTISTA O ÁLBUM..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className={styles.pillRow}>
            {DECADES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${styles.pill} ${decade === d.id ? styles.pillActive : ""}`}
                onClick={() => setDecade(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>

          {topGenres.length > 0 && (
            <div className={styles.pillRow}>
              <button
                type="button"
                className={`${styles.pill} ${genre === "all" ? styles.pillActive : ""}`}
                onClick={() => setGenre("all")}
              >
                TODOS LOS GÉNEROS
              </button>
              {topGenres.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`${styles.pill} ${genre === g ? styles.pillActive : ""}`}
                  onClick={() => setGenre(g)}
                >
                  {g.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className={styles.resultCount}>
          {filtered.length} DISCOS · PÁGINA {page + 1}/{totalPages}
        </p>

        <div className={styles.gridScroll}>
          <div className={styles.grid}>
            {pageItems.map((album) => (
              <JewelCaseFront
                key={album.id}
                album={album}
                onSelect={() => setSelected(album)}
              />
            ))}
          </div>
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ◄ ANTERIOR
            </button>
            <button
              type="button"
              className={styles.pageBtn}
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              SIGUIENTE ►
            </button>
          </div>
        )}
      </div>

      {selected && (
        <JewelCaseDetailModal
          album={selected}
          onClose={() => setSelected(null)}
          onLoad={(el) => {
            onLoadAlbum(selected, el);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
