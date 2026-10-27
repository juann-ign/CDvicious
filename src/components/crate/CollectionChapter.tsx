"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useRailActions } from "@/components/scroll/RailContext";
import {
  loadCollection,
  loadCollectionGenres,
  syncCollectionAuth,
  useCollectionCache,
} from "@/lib/collectionClient";
import {
  JewelCaseDetailModal,
  type StartPlayExecution,
} from "./JewelCaseDetailModal";
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
  const { scrollToChapter } = useRailActions();
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
  const [playErrorForAlbum, setPlayErrorForAlbum] = useState<{
    albumId: string;
    message: string;
  } | null>(null);
  const [flight, setFlight] = useState<{
    album: AlbumItem;
    originRect: DOMRect;
    attemptId: string;
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
    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    if (!railRoot) return;

    // Do not fetch and mount the full Collection grid just because a long
    // chapter jump passes through it. Load only after Collection is settled.
    const readActiveChapter = () => {
      const settledCollection =
        railRoot.dataset.chapter === "3" &&
        railRoot.dataset.railMoving !== "true";
      setIsActiveChapter((current) =>
        current === settledCollection ? current : settledCollection,
      );
    };

    readActiveChapter();

    const observer = new MutationObserver(readActiveChapter);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-chapter", "data-rail-moving"],
    });

    return () => observer.disconnect();
  }, []);

  // Update visual quality with attributes only; a full grid render during
  // wheel motion can stall the same main thread that advances Lenis.
  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    const chapter = chapterRef.current;
    if (!railRoot || !chapter) return;

    const sync = () => {
      const lightweight =
        railRoot.dataset.chapter !== "3" ||
        railRoot.dataset.railMoving === "true";
      chapter.setAttribute(
        "data-collection-transition-lite",
        lightweight ? "true" : "false",
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-chapter", "data-rail-moving"],
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
    setPlayErrorForAlbum(null);
    setSelected(album);
  }, []);

  const handlePlay = useCallback((
    album: AlbumItem,
    originEl: HTMLElement,
    executePlayback: StartPlayExecution,
    attemptId: string,
  ) => {
    const sourceChapter = Number(document.documentElement.dataset.chapter ?? "0");

    setPlayErrorForAlbum(null);
    setFlight({
      album,
      originRect: originEl.getBoundingClientRect(),
      attemptId,
    });
    setSelected(null);

    // Playback executes while the disc is in transit. On rejection, cancel the
    // transient flight, return to the source chapter, and restore modal feedback.
    void executePlayback()
      .then((result) => {
        if (result.success) return;

        window.dispatchEvent(
          new CustomEvent("cdvicious:disc-flight-cancelled", {
            detail: { attemptId },
          }),
        );
        setFlight((current) => current?.attemptId === attemptId ? null : current);
        setPlayErrorForAlbum({
          albumId: album.id,
          message: result.message ?? "Spotify no confirmó la reproducción. Podés intentarlo de nuevo.",
        });
        // Restore navigation before remounting the modal: its layout effect
        // acquires a Lenis stop token, which would make scrollToChapter a no-op.
        // The flight state is already cleared, so this frame runs after the disc
        // has unmounted and before the recovery modal locks the rail again.
        window.requestAnimationFrame(() => {
          scrollToChapter(sourceChapter, 0);
          setSelected(album);
        });
      })
      .catch(() => {
        window.dispatchEvent(
          new CustomEvent("cdvicious:disc-flight-cancelled", {
            detail: { attemptId },
          }),
        );
        setFlight((current) => current?.attemptId === attemptId ? null : current);
        setPlayErrorForAlbum({
          albumId: album.id,
          message: "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.",
        });
        // Restore navigation before remounting the modal: its layout effect
        // acquires a Lenis stop token, which would make scrollToChapter a no-op.
        // The flight state is already cleared, so this frame runs after the disc
        // has unmounted and before the recovery modal locks the rail again.
        window.requestAnimationFrame(() => {
          scrollToChapter(sourceChapter, 0);
          setSelected(album);
        });
      });
  }, [scrollToChapter]);

  const handleFlightArrive = useCallback((attemptId: string) => {
    window.dispatchEvent(
      new CustomEvent("cdvicious:disc-flight-arrived", { detail: { attemptId } }),
    );
  }, []);

  const handleFlightDone = useCallback((attemptId: string) => {
    window.dispatchEvent(
      new CustomEvent("cdvicious:disc-flight-done", { detail: { attemptId } }),
    );
    setFlight((current) => current?.attemptId === attemptId ? null : current);
  }, []);

  const handleClose = useCallback(() => {
    setSelected(null);
    setPlayErrorForAlbum(null);
  }, []);

  const handleLoad = useCallback(() => {
    setSelected(null);
    setPlayErrorForAlbum(null);
  }, []);

  return (
    <div
      ref={chapterRef}
      className={styles.chapter}
      data-collection-transition-lite="true"
    >
      <header className={styles.header}>
        <div>
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
          initialPlayError={
            playErrorForAlbum?.albumId === selected.id
              ? playErrorForAlbum.message
              : null
          }
          onPlay={(originEl, executePlayback, attemptId) =>
            handlePlay(selected, originEl, executePlayback, attemptId)
          }
        />
      )}

      {flight && (
        <RailFlyingDisc
          coverUrl={flight.album.images[0]?.url ?? ""}
          originRect={flight.originRect}
          attemptId={flight.attemptId}
          onArrive={handleFlightArrive}
          onDone={handleFlightDone}
        />
      )}
    </div>
  );
}
