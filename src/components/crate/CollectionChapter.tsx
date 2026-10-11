"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import {
  loadCollection,
  loadCollectionGenres,
  syncCollectionAuth,
  useCollectionCache,
} from "@/lib/collectionClient";
import { JewelCaseDetailModal } from "./JewelCaseDetailModal";
import { JewelCaseFront } from "./JewelCaseFront";
import { RailFlyingDisc } from "./RailFlyingDisc";
import type { AlbumItem } from "@/types/crate";
import styles from "./CollectionChapter.module.css";

type DecadeFilter = "all" | "2020s" | "2010s" | "older";

const DECADES: { id: DecadeFilter; label: string }[] = [
  { id: "all", label: "TODAS" },
  { id: "2020s", label: "2020s" },
  { id: "2010s", label: "2010s" },
  { id: "older", label: "ARCHIVO" },
];

const PAGE_SIZE = 32;
const TOP_GENRES_COUNT = 10;

function decadeOf(album: AlbumItem): DecadeFilter {
  const year = Number(album.release_date?.slice(0, 4));

  if (!year) return "older";
  if (year >= 2020) return "2020s";
  if (year >= 2010) return "2010s";
  return "older";
}

export function CollectionChapter() {
  const { authenticated } = useSpotifyPlayer();
  const { albums: cachedAlbums, genresLoaded } = useCollectionCache();
  const albums = useMemo(() => cachedAlbums ?? [], [cachedAlbums]);
  const [loading, setLoading] = useState(false);
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [isActiveChapter, setIsActiveChapter] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState<DecadeFilter>("all");
  const [genre, setGenre] = useState("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AlbumItem | null>(null);
  const [flight, setFlight] = useState<{
    album: AlbumItem;
    originRect: DOMRect;
  } | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const requestStartedRef = useRef(false);

  useEffect(() => {
    syncCollectionAuth(authenticated);
    if (authenticated !== true) {
      requestStartedRef.current = false;
    }
  }, [authenticated]);

  useEffect(() => {
    const readActiveChapter = () => {
      setIsActiveChapter(document.documentElement.dataset.chapter === "3");
    };

    readActiveChapter();

    const observer = new MutationObserver(readActiveChapter);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-chapter"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !isActiveChapter ||
      authenticated !== true ||
      cachedAlbums ||
      requestStartedRef.current ||
      quotaExceeded
    ) {
      return;
    }

    requestStartedRef.current = true;
    setLoading(true);
    setRateLimitSeconds(null);

    void loadCollection(authenticated)
      ?.catch((error: unknown) => {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? Number((error as { status?: number }).status)
            : 0;
        const reason =
          typeof error === "object" && error !== null && "reason" in error
            ? (error as { reason?: string }).reason
            : undefined;

        if (status === 429 && reason === "QUOTA_EXCEEDED") {
          setQuotaExceeded(true);
          setRateLimitSeconds(null);
        } else if (status === 429) {
          setRateLimitSeconds(60);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [authenticated, cachedAlbums, isActiveChapter, quotaExceeded]);

  const handleLoadGenres = useCallback(() => {
    if (authenticated !== true || genresLoaded || loadingGenres) return;

    setLoadingGenres(true);

    void loadCollectionGenres(authenticated)
      ?.catch(() => undefined)
      .finally(() => setLoadingGenres(false));
  }, [authenticated, genresLoaded, loadingGenres]);

  const topGenres = useMemo(() => {
    const counts = new Map<string, number>();

    for (const album of albums) {
      for (const item of album.genres ?? []) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_GENRES_COUNT)
      .map(([item]) => item);
  }, [albums]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return albums.filter((album) => {
      const matchesQuery =
        q === "" ||
        album.name.toLowerCase().includes(q) ||
        album.artists.some((artist) =>
          artist.name.toLowerCase().includes(q),
        );

      const matchesDecade =
        decade === "all" || decadeOf(album) === decade;

      const matchesGenre =
        genre === "all" || (album.genres ?? []).includes(genre);

      return matchesQuery && matchesDecade && matchesGenre;
    });
  }, [albums, query, decade, genre]);

  useEffect(() => {
    setPage(0);
  }, [query, decade, genre]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const handleSelect = useCallback((album: AlbumItem) => {
    setSelected(album);
  }, []);

  const handlePlay = useCallback((album: AlbumItem, originEl: HTMLElement) => {
    setFlight({
      album,
      originRect: originEl.getBoundingClientRect(),
    });
    setSelected(null);
  }, []);

  const handleFlightArrive = useCallback(() => {}, []);

  const handleFlightDone = useCallback(() => {
    setFlight(null);
  }, []);

  const handleClose = useCallback(() => {
    setSelected(null);
  }, []);

  const handleLoad = useCallback(() => {
    setSelected(null);
  }, []);

  return (
    <div ref={chapterRef} className={styles.chapter}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>CAP.04 / EPIC C</p>
          <h2>LA COLECCIÓN</h2>
        </div>
        <span className={styles.meta}>
          {quotaExceeded
            ? "SPOTIFY QUOTA EXCEEDED"
            : rateLimitSeconds !== null
              ? "RATE LIMITED / RETRY IN " + rateLimitSeconds + "s"
              : loading
              ? "INDEXANDO..."
              : filtered.length + " / " + albums.length + " DISCOS"}
        </span>
      </header>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="BUSCAR ARTISTA O ÁLBUM..."
          aria-label="Buscar artista o álbum"
        />

        <div className={styles.filterBlock}>
          <div className={styles.pillRow} aria-label="Filtrar por década">
            {DECADES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  styles.pill +
                  (decade === item.id ? " " + styles.pillActive : "")
                }
                onClick={() => setDecade(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.pillRow} aria-label="Filtrar por género">
            {!genresLoaded ? (
              <button
                type="button"
                className={styles.pill}
                onClick={handleLoadGenres}
                disabled={loadingGenres}
              >
                {loadingGenres ? "CARGANDO GÉNEROS..." : "CARGAR GÉNEROS"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={
                    styles.pill +
                    (genre === "all" ? " " + styles.pillActive : "")
                  }
                  onClick={() => setGenre("all")}
                >
                  TODOS
                </button>

                {topGenres.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      styles.pill +
                      (genre === item ? " " + styles.pillActive : "")
                    }
                    onClick={() => setGenre(item)}
                  >
                    {item.toUpperCase()}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      <div className={styles.gridFrame}>
        {loading ? (
          <div className={styles.emptyState}>CARGANDO COLECCIÓN...</div>
        ) : pageItems.length === 0 ? (
          <div className={styles.emptyState}>SIN RESULTADOS</div>
        ) : (
          <div className={styles.grid}>
            {pageItems.map((album) => (
              <JewelCaseFront
                key={album.id}
                album={album}
                onSelect={() => handleSelect(album)}
              />
            ))}
          </div>
        )}
      </div>

      <footer className={styles.footer}>
        <span className={styles.pageLabel}>
          PÁGINA {safePage + 1}/{totalPages}
        </span>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.pageButton}
            disabled={safePage === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            ◄ ANTERIOR
          </button>
          <button
            type="button"
            className={styles.pageButton}
            disabled={safePage >= totalPages - 1}
            onClick={() =>
              setPage((current) => Math.min(totalPages - 1, current + 1))
            }
          >
            SIGUIENTE ►
          </button>
        </div>
      </footer>

      {selected && (
        <JewelCaseDetailModal
          album={selected}
          onClose={handleClose}
          onLoad={handleLoad}
          onPlay={(originEl) => handlePlay(selected, originEl)}
        />
      )}

      {flight && (
        <RailFlyingDisc
          coverUrl={flight.album.images[0]?.url ?? ""}
          originRect={flight.originRect}
          onArrive={handleFlightArrive}
          onDone={handleFlightDone}
        />
      )}
    </div>
  );
}
