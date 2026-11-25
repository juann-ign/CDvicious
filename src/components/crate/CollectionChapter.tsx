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
import { ArtistExplorer } from "./ArtistExplorer";
import { RailFlyingDisc } from "./RailFlyingDisc";
import type { AlbumItem } from "@/types/crate";
import { collectionDecades, collectionGenres, filterCollection } from "@/lib/collectionFilters";
import styles from "./CollectionChapter.module.css";

const PAGE_SIZE = 32;

export function CollectionChapter() {
  const [exploringArtist, setExploringArtist] = useState(false);
  const [artistExplorerVisited, setArtistExplorerVisited] = useState(false);
  const { authenticated } = useSpotifyPlayer();
  const { scrollToChapter } = useRailActions();
  const { albums: cachedAlbums, collectionState, collectionError, collectionRetryAt, genresState, genresError, genresRetryAt, genresResolvedArtists, genresTotalArtists } = useCollectionCache();
  const albums = useMemo(() => cachedAlbums ?? [], [cachedAlbums]);
  const loading = collectionState === "loading";
  const loadingGenres = genresState === "loading";
  const [isActiveChapter, setIsActiveChapter] = useState(false);
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState("all");
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
  } | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const collectionWait = Math.max(0, Math.ceil((collectionRetryAt - now) / 1000));
  const genresWait = Math.max(0, Math.ceil((genresRetryAt - now) / 1000));

  useEffect(() => { setNow(Date.now()); }, [collectionRetryAt, genresRetryAt]);

  useEffect(() => {
    if (!collectionWait && !genresWait) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [collectionWait, genresWait]);

  useEffect(() => {
    syncCollectionAuth(authenticated);
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
      collectionState !== "idle"
    ) {
      return;
    }

    void loadCollection(authenticated)?.catch(() => undefined);
  }, [authenticated, cachedAlbums, isActiveChapter, collectionState]);

  const handleLoadGenres = useCallback(() => {
    if (authenticated !== true || loadingGenres || genresWait) return;
    void loadCollectionGenres(authenticated)?.catch(() => undefined);
  }, [authenticated, loadingGenres, genresWait]);

  // Options describe the full saved collection, before search and pagination.
  const decades = useMemo(() => collectionDecades(albums), [albums]);
  const topGenres = useMemo(() => collectionGenres(albums), [albums]);
  const filtered = useMemo(() => filterCollection(albums, query, decade, genre), [albums, query, decade, genre]);

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
  ) => {
    const sourceChapter = Number(document.documentElement.dataset.chapter ?? "0");

    setPlayErrorForAlbum(null);
    setFlight({
      album,
      originRect: originEl.getBoundingClientRect(),
    });
    setSelected(null);

    // Playback executes while the disc is in transit. On rejection, cancel the
    // transient flight, return to the source chapter, and restore modal feedback.
    void executePlayback()
      .then((result) => {
        if (result.success) return;

        window.dispatchEvent(new Event("cdvicious:disc-flight-cancelled"));
        setFlight(null);
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
        window.dispatchEvent(new Event("cdvicious:disc-flight-cancelled"));
        setFlight(null);
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

  const handleFlightArrive = useCallback(() => {
    window.dispatchEvent(new Event("cdvicious:disc-flight-arrived"));
  }, []);

  const handleFlightDone = useCallback(() => {
    window.dispatchEvent(new Event("cdvicious:disc-flight-done"));
    setFlight(null);
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
      data-artist-exploring={exploringArtist}
    >
      <div className={styles.collectionContent} hidden={exploringArtist}>
      <header className={styles.header}>
        <div>
          <h2>LA COLECCIÓN</h2>
        </div>
        <span className={styles.meta}>
          {collectionState === "error"
            ? "COLECCIÓN NO DISPONIBLE"
            : loading
              ? "INDEXANDO..."
              : filtered.length + " / " + albums.length + " DISCOS"}
        </span>
      </header>

      <button className={styles.exploreArtist} onClick={() => { setArtistExplorerVisited(true); setExploringArtist(true); }}>EXPLORAR ARTISTA ↗</button>
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
          <div className={styles.filterCaption}>DÉCADA · FECHA DE EDICIÓN</div>
          <div className={styles.pillRow} aria-label="Filtrar por década">
            {decades.map((item) => (
              <button
                key={item.id}
                type="button"
                className={
                  styles.pill +
                  (decade === item.id ? " " + styles.pillActive : "")
                }
                onClick={() => setDecade(item.id)}
                aria-pressed={decade === item.id}
                title={`${item.count} discos`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.filterCaption}>GÉNEROS DEL ARTISTA</div>
          <div className={styles.pillRow} aria-label="Filtrar por género">
            <button type="button" className={styles.pill + (genre === "all" ? " " + styles.pillActive : "")} onClick={() => setGenre("all")} aria-pressed={genre === "all"}>TODOS</button>
            {topGenres.map((item) => <button key={item.id} type="button" className={styles.pill + (genre === item.id ? " " + styles.pillActive : "")} onClick={() => setGenre(item.id)} aria-pressed={genre === item.id} title={`${item.count} discos`}>{item.label}</button>)}
            {(genresState === "idle" || loadingGenres || genresState === "partial" || genresState === "error") && (
              <button
                type="button"
                className={styles.pill}
                onClick={handleLoadGenres}
                disabled={loadingGenres || genresWait > 0 || !albums.length}
              >
                {loadingGenres ? "CARGANDO GÉNEROS..." : genresState === "idle" ? "CARGAR GÉNEROS" : "REINTENTAR GÉNEROS"}
              </button>
            )}
          </div>
          {loadingGenres && <p className={styles.filterStatus} role="status">CONSULTANDO GÉNEROS DE LOS ARTISTAS…</p>}
          {genresState === "empty" && <p className={styles.filterStatus} role="status">SIN GÉNEROS INFORMADOS PARA ESTOS ARTISTAS.</p>}
          {genresState === "partial" && <p className={styles.filterStatus} role="status">GÉNEROS PARCIALES · {genresResolvedArtists} / {genresTotalArtists} ARTISTAS CONSULTADOS. Podés filtrar con los datos disponibles.</p>}
          {genresState === "error" && <p className={styles.filterStatus} role="alert">GÉNEROS DEL ARTISTA: {genresError?.message}{genresError?.status === 401 && <a href="/api/auth/login"> CONECTAR SPOTIFY</a>}</p>}
          {genresWait > 0 && <p className={styles.filterStatus} role="status">REINTENTO DISPONIBLE EN {genresWait} s.</p>}
          {(query || decade !== "all" || genre !== "all") && <button type="button" className={styles.clearFilters} onClick={() => { setQuery(""); setDecade("all"); setGenre("all"); }}>LIMPIAR FILTROS</button>}
        </div>
      </div>

      <div className={styles.gridFrame}>
        {collectionState === "error" ? (
          <div className={styles.emptyState} role="alert"><div>{collectionError?.message}<div className={styles.recoveryActions}><button type="button" onClick={() => { setNow(Date.now()); void loadCollection(authenticated)?.catch(() => undefined); }} disabled={collectionWait > 0}>REINTENTAR COLECCIÓN</button>{collectionError?.status === 401 && <a href="/api/auth/login">CONECTAR SPOTIFY</a>}</div>{collectionWait > 0 && <p>REINTENTO DISPONIBLE EN {collectionWait} s.</p>}</div></div>
        ) : loading ? (
          <div className={styles.emptyState}>CARGANDO COLECCIÓN...</div>
        ) : pageItems.length === 0 ? (
          <div className={styles.emptyState}>{albums.length ? "SIN RESULTADOS PARA ESTOS FILTROS" : "COLECCIÓN VACÍA"}</div>
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
      </div>
      {artistExplorerVisited && <ArtistExplorer open={exploringArtist} active={isActiveChapter} onCollection={() => setExploringArtist(false)} />}

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
          onPlay={(originEl, executePlayback) =>
            handlePlay(selected, originEl, executePlayback)
          }
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
