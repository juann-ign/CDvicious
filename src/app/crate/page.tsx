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

const ITEMS_PER_PAGE = 24;

export default function CratePage() {
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetch("/api/collection")
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setAlbums(data);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const filteredAlbums = albums.filter((album) => {
    const query = searchQuery.toLowerCase();
    const matchName = album.name.toLowerCase().includes(query);
    const matchArtist = album.artists.some((a) =>
      a.name.toLowerCase().includes(query),
    );
    return matchName || matchArtist;
  });

  const totalPages = Math.ceil(filteredAlbums.length / ITEMS_PER_PAGE) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentAlbums = filteredAlbums.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  return (
    <main className="crate-stage">
      {loading && <div className="vfd-message">LOADING RACK...</div>}
      {error && <div className="vfd-message error">ERR: CONNECTION FAILED</div>}
      {!loading && !error && albums.length === 0 && (
        <div className="vfd-message">RACK EMPTY. ADD TO SPOTIFY.</div>
      )}

      {!loading && !error && albums.length > 0 && (
        <div className="crate-layout-wrapper">
          {/* 1. PANEL SUPERIOR DE CONTROL (Chasis serigrafiado y buscador unificado) */}
          <header className="console-module-deck top-deck">
            <h1 className="crate-title">BATEA DE CDs</h1>
            <div className="vfd-search-container">
              <span className="vfd-prompt">SRC:</span>
              <input
                type="text"
                placeholder="SEARCH ARTIST / ALBUM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="vfd-input"
              />
            </div>
          </header>

          {/* 2. EL MUEBLE / RACK CENTRAL CONTENEDOR */}
          <section className="physical-rack">
            <div className="rack-grid">
              {currentAlbums.map((album) => (
                <div className="rack-slot" key={album.id}>
                  <JewelCaseCard
                    id={album.id}
                    title={album.name}
                    artist={album.artists.map((a) => a.name).join(", ")}
                    coverUrl={album.images[0]?.url || ""}
                  />
                </div>
              ))}
              {Array.from({
                length: ITEMS_PER_PAGE - currentAlbums.length,
              }).map((_, i) => (
                <div className="rack-slot empty" key={`empty-${i}`} />
              ))}
            </div>
          </section>

          {/* 3. MÓDULO DE CONTROL INFERIOR (Transporte puro y simétrico) */}
          <div className="console-module-deck bottom-deck">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className="vfd-btn"
            >
              &lt;&lt; PREV
            </button>

            <div className="vfd-display">
              BANK 0{currentPage} / 0{totalPages}
            </div>

            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="vfd-btn"
            >
              NEXT &gt;&gt;
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .crate-stage {
          height: 100vh;
          max-height: 100vh;
          overflow: hidden;
          background-color: #111;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          color: #e0e0e0;
          box-sizing: border-box;
        }

        /* Contenedor general que unifica todo en un solo bloque macizo de estudio */
        .crate-layout-wrapper {
          display: flex;
          flex-direction: column;
          gap: 0px;
          width: 100%;
          max-width: 1420px;
          box-sizing: border-box;
          filter: drop-shadow(0 30px 60px rgba(0, 0, 0, 0.9));
        }

        /* PANEL SUPERIOR: Centrado vertical perfecto y respiro simétrico */
        .console-module-deck.top-deck {
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
          border-bottom-left-radius: 0px;
          border-bottom-right-radius: 0px;
          border-bottom: 2px solid #2a2d33;
          border-top: 4px solid #5e646d;
          border-left: 4px solid #5e646d;
          border-right: 4px solid #5e646d;
          /* CAMBIO: Aumentamos el padding vertical para centrar óptimamente el texto y el buscador */
          padding: 12px 24px;
        }

        .crate-title {
          font-family: "Helvetica", sans-serif;
          font-weight: 900;
          font-size: 15px;
          letter-spacing: 4px;
          color: #fff;
          margin: 0;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
        }

        /* --- ESTRUCTURA DEL RACK CENTRAL --- */
        .physical-rack {
          width: 100%;
          background: #4a4f56;
          border-left: 4px solid #5e646d;
          border-right: 4px solid #5e646d;
          border-top: 2px solid #3a3f48;
          border-bottom: 2px solid #3a3f48;
          border-radius: 0px;
          padding: 3px;
          box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
        }

        /* Grilla de varillas */
        .rack-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: repeat(4, 1fr);
          background-color: #1c1e22;
          border: 2px solid #1a1c1e;
          gap: 5px;
          width: 100%;
          aspect-ratio: 2.15 / 1;
        }

        /* Celdas individuales */
        .rack-slot {
          background-color: #2b2f36;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          /* CAMBIO CRÍTICO: Ajustamos el padding [Arriba, Derecha, Abajo, Izquierda]. 
             Le damos más aire arriba (12px) para que el CD al hacer hover y abrirse 
             no colisione con el borde metálico superior del rack. */
          padding: 12px 20px 6px 10px;
          position: relative;
          box-shadow:
            inset 3px 3px 8px rgba(0, 0, 0, 0.6),
            inset -1px -1px 3px rgba(255, 255, 255, 0.1);
        }

        /* Slots vacíos con textura de ranura industrial */
        .rack-slot.empty {
          background-color: #1f2227;
          background-image: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 6px,
            rgba(0, 0, 0, 0.3) 6px,
            rgba(0, 0, 0, 0.3) 7px
          );
          opacity: 0.5;
        }

        /* MÓDULO DE CONTROL INFERIOR */
        .console-module-deck.bottom-deck {
          border-top-left-radius: 0px;
          border-top-right-radius: 0px;
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
          border-top: 2px solid #2a2d33;
          border-bottom: 4px solid #5e646d;
          border-left: 4px solid #5e646d;
          border-right: 4px solid #5e646d;
          padding: 12px 24px;
        }

        .console-module-deck {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: #141619;
          width: 100%;
          box-sizing: border-box;
          box-shadow: inset 0 4px 6px rgba(0, 0, 0, 0.7);
        }

        .vfd-display {
          font-family: "Courier New", monospace;
          color: #55ff55;
          font-size: 12px;
          letter-spacing: 4px;
          text-shadow: 0 0 8px rgba(85, 255, 85, 0.5);
          white-space: nowrap;
        }

        .vfd-btn {
          background: linear-gradient(to bottom, #22262b, #15181c);
          border: 1px solid #3a3f4b;
          border-bottom: 3px solid #090a0c;
          color: #cfcfcf;
          font-family: "Courier New", monospace;
          font-size: 10px;
          letter-spacing: 1.5px;
          padding: 6px 14px;
          border-radius: 2px;
          cursor: pointer;
          transition: all 0.08s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
          white-space: nowrap;
        }

        .vfd-btn:hover:not(:disabled) {
          color: #ffffff;
          border-color: #55ff55;
        }

        .vfd-btn:active:not(:disabled) {
          border-bottom: 1px solid #090a0c;
          transform: translateY(2px);
          color: #55ff55;
          background: #121417;
        }

        .vfd-btn:disabled {
          background: #181a1e;
          border: 1px solid #282c33;
          border-bottom: 2px solid #0e1012;
          color: #7a828e;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .vfd-message {
          font-family: "Courier New", monospace;
          color: #0f0;
          text-shadow: 0 0 5px #0f0;
          margin-top: 10vh;
        }

        .vfd-message.error {
          color: #f00;
        }

        /* Buscador superior con etiqueta SRC: y fósforo VFD */
        .vfd-search-container {
          display: flex;
          align-items: center;
          background: #090b0d;
          border: 1px inset #222;
          border-radius: 2px;
          padding: 4px 10px;
          gap: 8px;
          width: 280px;
          box-shadow: inset 0 3px 6px rgba(0, 0, 0, 0.9);
        }

        .vfd-prompt {
          font-family: "Courier New", monospace;
          color: #44aa44;
          font-size: 10px;
          font-weight: bold;
          letter-spacing: 1px;
        }

        .vfd-input {
          background: transparent;
          border: none;
          outline: none;
          font-family: "Courier New", monospace;
          color: #7fff7f;
          font-size: 11px;
          letter-spacing: 2px;
          width: 100%;
          text-shadow: 0 0 8px rgba(127, 255, 127, 0.6);
        }

        .vfd-input::placeholder {
          color: #2c552c;
          text-shadow: none;
        }

        /* Escalado interno de las cajas */
        :global(.rack-slot > div) {
          transform: scale(0.9);
          width: 100%;
        }
      `}</style>
    </main>
  );
}
