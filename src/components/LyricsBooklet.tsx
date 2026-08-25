"use client";

import { useState, useEffect } from "react";
import type { SpotifyTrack } from "@/types/spotify";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
}

export function LyricsBooklet({ track }: LyricsBookletProps) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false); // Para abrir/cerrar el librito tipo físico

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      return;
    }

    const fetchLyrics = async () => {
      setLoading(true);
      try {
        const artist = track.artists[0]?.name || "";
        const title = track.name || "";
        const album = track.album?.name || "";
        const duration = Math.round((track.duration_ms || 0) / 1000);

        const res = await fetch(
          `/api/lyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&album=${encodeURIComponent(album)}&duration=${duration}`,
        );
        const data = await res.json();

        setLyrics(data.lyrics || "No se encontró la letra para esta pista.");
      } catch (err) {
        setLyrics("Error al cargar la letra.");
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, [track?.id]);

  if (!track) return null;

  return (
    <div
      style={{ position: "fixed", right: "28px", bottom: "40px", zIndex: 10 }}
    >
      {/* Botón para abrir el librito */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: "rgba(30, 32, 38, 0.85)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          color: "#eceef0",
          padding: "10px 18px",
          borderRadius: "999px",
          cursor: "pointer",
          fontSize: "13px",
          fontFamily: "monospace",
          letterSpacing: "1px",
          backdropFilter: "blur(10px)",
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.5)",
          transition: "all 0.2s ease",
        }}
      >
        📖 {isOpen ? "Cerrar Librito" : "Ver Librito"}
      </button>

      {/* Contenedor del librito desplegable */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            bottom: "55px",
            right: "0",
            width: "320px",
            maxHeight: "450px",
            background: "#f4f1ea", // Color papel marfil clásico de booklet
            color: "#2b2b2b",
            borderRadius: "12px",
            padding: "24px",
            boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
            overflowY: "auto",
            fontFamily: '"Times New Roman", Times, serif', // Tipografía de libro/revista
            border: "1px solid #dcd6cd",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: "16px",
              borderBottom: "1px solid #dcd6cd",
              paddingBottom: "10px",
            }}
          >
            <h4 style={{ fontSize: "15px", fontWeight: "bold", margin: 0 }}>
              {track.name}
            </h4>
            <span
              style={{ fontSize: "12px", fontStyle: "italic", color: "#666" }}
            >
              {track.artists.map((a) => a.name).join(", ")}
            </span>
          </div>

          {loading ? (
            <p style={{ textAlign: "center", fontSize: "13px", color: "#666" }}>
              Buscando en los archivos...
            </p>
          ) : (
            <div
              style={{
                fontSize: "13px",
                lineHeight: "1.6",
                whiteSpace: "pre-line",
                textAlign: "center",
              }}
            >
              {lyrics}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
