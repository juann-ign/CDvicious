"use client";

import { useState, useEffect, useMemo } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import styles from "./LyricsBooklet.module.css";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
}

export function LyricsBooklet({ track }: LyricsBookletProps) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      setIsOpen(false);
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
      } catch (err) {
        setLyrics("Error de lectura del archivo.");
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, [track?.id]);

  // Se cortan líneas de forma plana respetando el texto original sin agrupar bloques forzados.
  const pages = useMemo(() => {
    if (!lyrics) return [];

    const lines = lyrics.split("\n");
    const maxPageWeight = 14; // Tope estricto pedido
    const result: string[] = [];
    let currentPageLines: string[] = [];
    let currentWeight = 0;

    lines.forEach((line) => {
      // Si la línea tiene más de 38 caracteres, el navegador la baja a 2 renglones (Pesa 2).
      // Las líneas normales o los espacios en blanco pesan 1.
      const lineWeight = line.length > 60 ? 2 : 1; // 👈 TOQUE DE GUSTO 2: Umbral de caracteres para el wrap

      if (currentWeight + lineWeight <= maxPageWeight) {
        currentPageLines.push(line);
        currentWeight += lineWeight;
      } else {
        // Si excede el peso de la página, cerramos la hoja actual y empezamos una nueva
        if (currentPageLines.length > 0) {
          result.push(currentPageLines.join("\n"));
        }
        currentPageLines = [line];
        currentWeight = lineWeight;
      }
    });

    // Guardamos el remanente final
    if (currentPageLines.length > 0) {
      result.push(currentPageLines.join("\n"));
    }

    return result.length > 0 ? result : [lyrics];
  }, [lyrics]);

  if (!track) return null;

  return (
    <>
      {/* BOTÓN FÍSICO (Pestaña lateral estilo índice) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={styles.bookletTab}
        aria-label="Abrir Booklet"
      >
        {isOpen ? "CERRAR BOOKLET" : "VER BOOKLET"}
      </button>

      {/* EL LIBRITO FÍSICO AMPLIADO */}
      <div
        className={`${styles.bookletContainer} ${isOpen ? styles.isOpen : ""}`}
      >
        <div className={styles.bookletPage}>
          <div className={styles.bookletSpineShadow} />

          <div className={styles.bookletContent}>
            <div className={styles.bookletHeader}>
              <h4>{track.name}</h4>
              <span>{track.artists.map((a) => a.name).join(", ")}</span>
            </div>

            {loading ? (
              <div className={styles.bookletLoading}>
                [ BUSCANDO EN ARCHIVOS... ]
              </div>
            ) : (
              <div className={styles.bookletLyrics}>
                {pages[currentPage] || ""}
              </div>
            )}
          </div>

          {/* CONTROLES DE PAGINACIÓN */}
          {!loading && pages.length > 1 && (
            <div className={styles.bookletPagination}>
              <button
                disabled={currentPage === 0}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                ◄ PREV
              </button>
              <span>
                {currentPage + 1} / {pages.length}
              </span>
              <button
                disabled={currentPage === pages.length - 1}
                onClick={() => setCurrentPage((p) => p + 1)}
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
