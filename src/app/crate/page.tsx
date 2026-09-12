"use client";

import { useEffect, useState } from "react";
import { JewelCaseCard } from "../../components/JewelCardCase";
import styles from "./page.module.css";

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
    <main className={styles.stage}>
      {loading && <div className={styles.message}>LOADING RACK...</div>}
      {error && (
        <div className={`${styles.message} ${styles.error}`}>
          ERR: CONNECTION FAILED
        </div>
      )}
      {!loading && !error && albums.length === 0 && (
        <div className={styles.message}>RACK EMPTY. ADD TO SPOTIFY.</div>
      )}

      {!loading && !error && albums.length > 0 && (
        <div className={styles.layoutWrapper}>
          <header className={`${styles.console} ${styles.topDeck}`}>
            <h1 className={styles.title}>BATEA DE CDs</h1>
            <div className={styles.searchContainer}>
              <span className={styles.prompt}>SRC:</span>
              <input
                type="text"
                placeholder="SEARCH ARTIST / ALBUM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.input}
              />
            </div>
          </header>

          <section className={styles.physicalRack}>
            <div className={styles.rackGrid}>
              {currentAlbums.map((album) => (
                <div className={styles.rackSlot} key={album.id}>
                  <div className={styles.caseScale}>
                    <JewelCaseCard
                      id={album.id}
                      title={album.name}
                      artist={album.artists.map((a) => a.name).join(", ")}
                      coverUrl={album.images[0]?.url || ""}
                    />
                  </div>
                </div>
              ))}
              {Array.from({
                length: ITEMS_PER_PAGE - currentAlbums.length,
              }).map((_, i) => (
                <div className={`${styles.rackSlot} ${styles.empty}`} key={`empty-${i}`} />
              ))}
            </div>
          </section>

          <div className={`${styles.console} ${styles.bottomDeck}`}>
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={styles.vfdButton}
            >
              &lt;&lt; PREV
            </button>

            <div className={styles.vfdDisplay}>
              BANK 0{currentPage} / 0{totalPages}
            </div>

            <button
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={styles.vfdButton}
            >
              NEXT &gt;&gt;
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
