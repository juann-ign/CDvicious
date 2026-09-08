"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

interface Album {
  id: string;
  name: string;
  uri: string;
  images: {
    url: string;
    width: number;
    height: number;
  }[];
  artists: {
    name: string;
  }[];
}

export function StoreSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Album[]>([]);
  const [savedAlbums, setSavedAlbums] = useState<Album[]>([]);
  const { deviceId, isReady } = useSpotifyPlayer();

  useEffect(() => {
    fetch("/api/collection")
      .then((res) => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setSavedAlbums(data as Album[]);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${query}`);

      if (res.ok) {
        const data: unknown = await res.json();

        if (Array.isArray(data)) {
          setResults(data as Album[]);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handlePlayAlbum = async (uri: string) => {
    if (!deviceId) return;

    await fetch("/api/play", {
      method: "POST",
      body: JSON.stringify({ uri, deviceId }),
    });
  };

  const displayAlbums = query ? results : savedAlbums;
  const sectionTitle = query ? "Resultados de búsqueda" : "Tu Colección";

  return (
    <div
      style={{
        position: "fixed",
        top: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(90vw, 420px)",
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
          padding: "10px 18px",
          borderRadius: "999px",
          background: "rgba(30, 32, 38, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          color: "#eceef0",
          fontSize: "13px",
          outline: "none",
          backdropFilter: "blur(10px)",
          boxShadow: "0 8px 20px -8px rgba(0, 0, 0, 0.5)",
        }}
      />

      {displayAlbums.length > 0 && (
        <div style={{ marginTop: "12px" }}>
          <h3
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "#82848a",
              marginBottom: "8px",
              marginLeft: "8px",
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
              gap: "12px",
              paddingBottom: "8px",
              paddingLeft: "4px",
              scrollbarWidth: "none",
            }}
          >
            {displayAlbums.map((album) => (
              <div
                key={album.id}
                onClick={() => handlePlayAlbum(album.uri)}
                style={{
                  minWidth: "85px",
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
                  width={85}
                  height={85}
                  style={{
                    borderRadius: "6px",
                    objectFit: "cover",
                    boxShadow: "0 4px 10px rgba(0,0,0,0.4)",
                  }}
                />

                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#eceef0",
                    marginTop: "6px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {album.name}
                </div>

                <div
                  style={{
                    fontSize: "9px",
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
