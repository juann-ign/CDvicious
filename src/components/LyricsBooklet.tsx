"use client";

import { useState, useEffect, useMemo } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import styles from "./LyricsBooklet.module.css";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
  isOpen: boolean;
  onToggle: () => void;
}

export function LyricsBooklet({ track, isOpen, onToggle }: LyricsBookletProps) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      return;
    }

    const fetchLyrics = async () => {
      setLoading(true);
      setCurrentPage(0);
      try {
        const artist = track.artists[0]?.name || "";
        const title = track.name || "";
        const album = track.album?.name || "";
        const duration = Math.round((track.duration_ms || 0) / 1000);

        const res = await fetch(
          `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&album=${encodeURIComponent(album)}&duration=${duration}`,
        );
        const data = await res.json();
        setLyrics(data.lyrics || "Pista instrumental / Letra no encontrada.");
      } catch {
        setLyrics("Error de lectura del archivo.");
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, [track?.id]);

  // Generación de páginas con mayor capacidad por bloque (Spread Layout)
  const pages = useMemo(() => {
    if (!lyrics) return [];
    const lines = lyrics.split("\n");
    const maxPageWeight = 22; // Más peso por página para aprovechar el spread de dos hojas
    const result: string[] = [];
    let currentPageLines: string[] = [];
    let currentWeight = 0;

    lines.forEach((line) => {
      const lineWeight = line.length > 50 ? 2 : 1;
      if (currentWeight + lineWeight <= maxPageWeight) {
        currentPageLines.push(line);
        currentWeight += lineWeight;
      } else {
        if (currentPageLines.length > 0) {
          result.push(currentPageLines.join("\n"));
        }
        currentPageLines = [line];
        currentWeight = lineWeight;
      }
    });

    if (currentPageLines.length > 0) {
      result.push(currentPageLines.join("\n"));
    }

    return result.length > 0 ? result : [lyrics];
  }, [lyrics]);

  if (!track) return null;

  // Avanzamos de 2 en 2 páginas para el formato de libro abierto
  const leftPageIdx = currentPage;
  const rightPageIdx = currentPage + 1;
  const totalSpreads = Math.ceil(pages.length / 2);
  const currentSpread = Math.floor(currentPage / 2) + 1;

  return (
    <>
      <button
        onClick={onToggle}
        className={styles.bookletTab}
        aria-label="Abrir Booklet"
      >
        {isOpen ? "CERRAR BOOKLET" : "VER BOOKLET"}
      </button>

      <div
        className={`${styles.bookletContainer} ${isOpen ? styles.isOpen : ""}`}
      >
        <div className={styles.bookletPageSpread}>
          {/* LOMO CENTRAL DEL LIBRO ABIERTO */}
          <div className={styles.bookletCenterSpine} />

          {/* PÁGINA IZQUIERDA */}
          <div className={styles.bookletPageHalf}>
            <div className={styles.bookletContent}>
              {leftPageIdx === 0 && (
                <div className={styles.bookletHeader}>
                  <h4>{track.name}</h4>
                  <span>{track.artists.map((a) => a.name).join(", ")}</span>
                </div>
              )}
              <div className={styles.bookletLyrics}>
                {loading ? "[ CARGANDO... ]" : pages[leftPageIdx] || ""}
              </div>
            </div>
          </div>

          {/* PÁGINA DERECHA */}
          <div className={styles.bookletPageHalf}>
            <div className={styles.bookletContent}>
              <div className={styles.bookletLyrics}>
                {loading ? "" : pages[rightPageIdx] || ""}
              </div>
            </div>
          </div>

          {/* PAGINACIÓN INFERIOR DE DOBLE HOJA */}
          {!loading && pages.length > 2 && (
            <div className={styles.bookletPagination}>
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => Math.max(0, p - 2))}
              >
                ◄ PREV
              </button>
              <span>
                SPREAD {currentSpread} / {totalSpreads}
              </span>
              <button
                disabled={rightPageIdx >= pages.length - 1}
                onClick={() => setCurrentPage((p) => p + 2)}
              >
                NEXT ►
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
