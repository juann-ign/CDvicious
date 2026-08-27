"use client";

import { useState, useEffect, useMemo } from "react";
import type { SpotifyTrack } from "@/types/spotify";

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

  // [MODIFICACIÓN 1] Paginación por conteo lineal estricto (13 líneas por página).
  // Se cortan líneas de forma plana respetando el texto original sin agrupar bloques forzados.
  const pages = useMemo(() => {
    if (!lyrics) return [];

    const lines = lyrics.split("\n");
    const linesPerPage = 12; // Tope estricto pedido
    const result: string[] = [];

    for (let i = 0; i < lines.length; i += linesPerPage) {
      result.push(lines.slice(i, i + linesPerPage).join("\n"));
    }

    return result.length > 0 ? result : [lyrics];
  }, [lyrics]);

  if (!track) return null;

  return (
    <>
      {/* BOTÓN FÍSICO (Pestaña lateral estilo índice) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="booklet-tab"
        aria-label="Abrir Booklet"
      >
        {isOpen ? "CERRAR BOOKLET" : "VER BOOKLET"}
      </button>

      {/* EL LIBRITO FÍSICO AMPLIADO */}
      <div className={`booklet-container ${isOpen ? "is-open" : ""}`}>
        <div className="booklet-page">
          <div className="booklet-spine-shadow" />

          <div className="booklet-content">
            <div className="booklet-header">
              <h4>{track.name}</h4>
              <span>{track.artists.map((a) => a.name).join(", ")}</span>
            </div>

            {loading ? (
              <div className="booklet-loading">[ BUSCANDO EN ARCHIVOS... ]</div>
            ) : (
              <div className="booklet-lyrics">{pages[currentPage] || ""}</div>
            )}
          </div>

          {/* CONTROLES DE PAGINACIÓN */}
          {!loading && pages.length > 1 && (
            <div className="booklet-pagination">
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

      <style jsx>{`
        .booklet-tab {
          position: fixed;
          right: 0;
          top: 50%;
          transform: translateY(-50%) rotate(-90deg);
          transform-origin: right bottom;
          background: #d4cfc5;
          border: 1px solid #a39e93;
          border-bottom: none;
          color: #2b2b2b;
          padding: 6px 16px;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-weight: bold;
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 4px 4px 0 0;
          box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.3);
          z-index: 10;
          transition: all 0.2s ease;
        }
        .booklet-tab:hover {
          background: #e6e2d8;
        }

        /* Contenedor principal ampliado (De 450px a 550px para tamaño real de imprenta) */
        .booklet-container {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-70%, -50%) scale(0.9);
          width: min(85vw, 480px);
          height: 480px;
          aspect-ratio: 1 / 1;
          z-index: 1;
          opacity: 0;
          visibility: hidden;
          transition: all 0.6s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .booklet-container.is-open {
          transform: translate(75%, -50%) scale(1);
          opacity: 1;
          visibility: visible;
          box-shadow: 30px 30px 60px rgba(0, 0, 0, 0.8);
        }

        @media (max-width: 768px) {
          .booklet-container.is-open {
            transform: translate(-50%, -85%) scale(1);
          }
        }

        .booklet-page {
          position: relative;
          width: 100%;
          height: 100%;
          background-color: #f4f1ea;
          background-image: url("https://www.transparenttextures.com/patterns/cream-paper.png");
          border-radius: 2px 8px 8px 2px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          border: 1px solid #dcd6cd;
        }

        .booklet-spine-shadow {
          position: absolute;
          top: 0;
          left: 0;
          bottom: 0;
          width: 30px;
          background: linear-gradient(
            90deg,
            rgba(0, 0, 0, 0.25) 0%,
            rgba(0, 0, 0, 0.05) 30%,
            rgba(255, 255, 255, 0.4) 60%,
            rgba(0, 0, 0, 0) 100%
          );
          pointer-events: none;
          z-index: 2;
        }

        .booklet-content {
          padding: 35px 25px 10px 50px;
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .booklet-header {
          border-bottom: 2px solid #2b2b2b;
          padding-bottom: 10px;
          margin-bottom: 18px;
          flex-shrink: 0;
        }

        .booklet-header h4 {
          font-family: "Helvetica", Arial, sans-serif;
          font-weight: 900;
          font-size: 20px;
          text-transform: uppercase;
          letter-spacing: -0.5px;
          color: #1a1a1a;
          margin: 0 0 4px 0;
        }

        .booklet-header span {
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          color: #555;
          text-transform: uppercase;
        }

        /* [MODIFICACIÓN 2] Altura de línea compacta (1.35) y restricción máxima de caja 
           para asegurar que nunca se desborde ni se meta debajo de la card inferior. */
        .booklet-lyrics {
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          line-height: 1.35;
          letter-spacing: -0.2px;
          color: #1a1a1a;
          white-space: pre-wrap;
          font-weight: 400;
          flex: 1;
          overflow: hidden;
        }

        .booklet-loading {
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          color: #888;
          margin-top: 20px;
        }

        .booklet-pagination {
          flex-shrink: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 30px 15px 50px;
          border-top: 1px solid #dcd6cd;
          background: rgba(0, 0, 0, 0.02);
        }

        .booklet-pagination button {
          background: none;
          border: none;
          font-family: "Courier New", Courier, monospace;
          font-size: 12px;
          font-weight: bold;
          color: #2b2b2b;
          cursor: pointer;
          padding: 4px 8px;
        }

        .booklet-pagination button:disabled {
          color: #bbb;
          cursor: not-allowed;
        }

        .booklet-pagination button:not(:disabled):hover {
          background: #2b2b2b;
          color: #f4f1ea;
        }

        .booklet-pagination span {
          fhir-family: "Helvetica", Arial, sans-serif;
          font-size: 11px;
          font-weight: bold;
          color: #888;
        }
      `}</style>
    </>
  );
}
