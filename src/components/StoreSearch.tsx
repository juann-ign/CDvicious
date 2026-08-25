"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

export function StoreSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<any[]>([]);
  const { deviceId, isReady } = useSpotifyPlayer();

  // 1. Cargar colección al inicio
  useEffect(() => {
    fetch("/api/collection")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSavedAlbums(data);
      })
      .catch(console.error);
  }, []);

  // 2. Búsqueda en vivo (Debounce)
  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${query}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  // 3. Función de reproducción
  const handlePlayAlbum = async (uri: string) => {
    if (!deviceId) return;
    await fetch("/api/play", {
      method: "POST",
      body: JSON.stringify({ uri, deviceId }),
    });
  };

  // 4. Lógica de renderizado: ¿Qué mostramos?
  const displayAlbums = query ? results : savedAlbums;
  const sectionTitle = query ? "Resultados de búsqueda" : "Tu Colección";

  return (
    <div
      style={{
        position: "fixed",
        top: "80px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(90vw, 500px)",
        zIndex: 10,
      }}
    >
      <input
        type="text"
        placeholder="Buscar discos..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{
          width: "100%",
          padding: "14px 20px",
          borderRadius: "999px",
          background: "rgba(30, 32, 38, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#eceef0",
          fontSize: "14px",
          outline: "none",
          backdropFilter: "blur(10px)",
          boxShadow: "0 12px 30px -12px rgba(0, 0, 0, 0.5)",
        }}
      />

      {displayAlbums.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <h3
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "#82848a",
              marginBottom: "12px",
              marginLeft: "4px",
              textTransform: "uppercase",
              letterSpacing: "1px",
            }}
          >
            {sectionTitle}
          </h3>

          <div
            style={{
              display: "flex",
              overflowX: "auto",
              gap: "16px",
              paddingBottom: "12px",
              scrollbarWidth: "none",
            }}
          >
            {displayAlbums.map((album) => (
              <div
                key={album.id}
                onClick={() => handlePlayAlbum(album.uri)}
                style={{
                  minWidth: "110px",
                  cursor: isReady ? "pointer" : "not-allowed",
                  opacity: isReady ? 1 : 0.5,
                  transition: "transform 0.2s ease",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "translateY(-4px)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "translateY(0)")
                }
              >
                <Image
                  src={album.images[0]?.url}
                  alt={album.name}
                  width={110}
                  height={110}
                  style={{
                    borderRadius: "8px",
                    objectFit: "cover",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  }}
                />
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#eceef0",
                    marginTop: "8px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {album.name}
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    color: "#82848a",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {album.artists[0]?.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
