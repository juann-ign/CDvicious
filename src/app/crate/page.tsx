"use client";

import { JewelCaseCard } from "../../components/JewelCardCase";

// Mock Data: El esqueleto falso
const MOCK_ALBUMS = [
  {
    id: "1",
    title: "Dynamo",
    artist: "Soda Stereo",
    coverUrl: "https://picsum.photos/seed/dynamo/400/400",
  },
  {
    id: "2",
    title: "Bocanada",
    artist: "Gustavo Cerati",
    coverUrl: "https://picsum.photos/seed/bocanada/400/400",
  },
  {
    id: "3",
    title: "Luzbelito",
    artist: "Patricio Rey",
    coverUrl: "https://picsum.photos/seed/luzbelito/400/400",
  },
  {
    id: "4",
    title: "Clics Modernos",
    artist: "Charly García",
    coverUrl: "https://picsum.photos/seed/clics/400/400",
  },
  {
    id: "5",
    title: "Jessico",
    artist: "Babasónicos",
    coverUrl: "https://picsum.photos/seed/jessico/400/400",
  },
  {
    id: "6",
    title: "Artaud",
    artist: "Pescado Rabioso",
    coverUrl: "https://picsum.photos/seed/artaud/400/400",
  },
];

export default function CratePage() {
  return (
    <main className="crate-stage">
      <div className="crate-header">
        <h1>TU COLECCIÓN</h1>
        <p>Acrílico y polvo.</p>
      </div>

      <div className="crate-grid">
        {MOCK_ALBUMS.map((album) => (
          <JewelCaseCard
            key={album.id}
            title={album.title}
            artist={album.artist}
            coverUrl={album.coverUrl}
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

        /* Grilla ajustada: Columnas más amplias y mayor gap horizontal para que el CD respire */
        .crate-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 30px 60px; /* 40px vertical, 45px horizontal de respiro */
          max-width: 1200px;
          margin: 0 auto;
        }
      `}</style>
    </main>
  );
}
