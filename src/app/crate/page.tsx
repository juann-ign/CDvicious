"use client";

import { useEffect, useState } from "react";
import { JewelCaseCard } from "../../components/JewelCardCase";

interface AlbumItem {
  id: string;
  name: string;
  artists: { name: string }[];
  images: { url: string }[];
  uri: string;
}

export default function CratePage() {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/collection")
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar la colección");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setAlbums(data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="crate-stage">
      <div className="crate-header">
        <h1>TU COLECCIÓN</h1>
        <p>Acrílico y polvo.</p>
      </div>

      {loading && (
        <div className="crate-status-message">
          [ BUSCANDO DISCOS EN EL ESTANTE... ]
        </div>
      )}

      {error && (
        <div className="crate-status-message error">
          [ ERR: NO SE PUDO CONECTAR CON LA COLECCIÓN ]
        </div>
      )}

      {!loading && !error && albums.length === 0 && (
        <div className="crate-status-message">
          [ LA BATEA ESTÁ VACÍA. GUARDÁ ÁLBUMES EN SPOTIFY ]
        </div>
      )}

      <div className="crate-grid">
        {albums.map((album) => (
          <JewelCaseCard
            key={album.id}
            id={album.id}
            title={album.name}
            artist={album.artists.map((a) => a.name).join(", ")}
            coverUrl={album.images[0]?.url || ""}
          />
        ))}
      </div>

      <style jsx>{`
        .crate-stage {
          min-height: 100vh;
          background-color: #2b2e31;
          background-image: radial-gradient(
            circle at 50% -10%,
            #4a5055 0%,
            #2b2e31 70%
          );
          padding: 40px 20px;
          color: #e0e0e0;
        }

        .crate-header {
          margin-bottom: 50px;
          text-align: center;
        }

        .crate-header h1 {
          font-family: "Helvetica", Arial, sans-serif;
          font-weight: 900;
          font-size: 26px;
          letter-spacing: 3px;
          color: #ffffff;
          margin: 0 0 8px 0;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
        }

        .crate-header p {
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          color: #939a9f;
          margin: 0;
        }

        .crate-status-message {
          text-align: center;
          font-family: "Courier New", Courier, monospace;
          font-size: 13px;
          color: #82848a;
          margin-top: 60px;
          letter-spacing: 1px;
        }

        .crate-status-message.error {
          color: #ff3333;
        }

        /* Grilla ajustada: Columnas más amplias y mayor gap horizontal para que el CD respire */
        .crate-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 30px 60px;
          max-width: 1200px;
          margin: 0 auto;
        }
      `}</style>
    </main>
  );
}
