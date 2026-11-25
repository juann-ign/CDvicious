"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import {
  loadCollection,
  loadCollectionGenres,
  syncCollectionAuth,
  useCollectionCache,
} from "@/lib/collectionClient";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { JewelCaseFront } from "./JewelCaseFront";
import { ArtistExplorer } from "./ArtistExplorer";
import type { AlbumItem } from "@/types/crate";
import { collectionDecades, collectionGenres, collectionYears, filterCollection } from "@/lib/collectionFilters";
import styles from "./CollectionChapter.module.css";
import { collectionLayout, pageForAnchor } from "@/lib/collectionLayout";

export function CollectionChapter() {
  const [exploringArtist, setExploringArtist] = useState(false);
  const [artistExplorerVisited, setArtistExplorerVisited] = useState(false);
  const { openAlbum } = useAlbumDetailActions();
  const { authenticated } = useSpotifyPlayer();
  const { albums: cachedAlbums, collectionState, collectionError, collectionRetryAt, genresState, genresError, genresRetryAt, genresResolvedArtists, genresTotalArtists } = useCollectionCache();
  const albums = useMemo(() => cachedAlbums ?? [], [cachedAlbums]);
  const loading = collectionState === "loading" || (collectionState === "idle" && !cachedAlbums && authenticated !== false);
  const loadingGenres = genresState === "loading";
  const [isActiveChapter, setIsActiveChapter] = useState(false);
  const [query, setQuery] = useState("");
  const [decade, setDecade] = useState("all");
  const [genre, setGenre] = useState("all");
  const [year, setYear] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(12);
  const gridRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef({ page: 0, pageSize: 12, count: 0, anchorIndex: 0 });
  const anchorIdRef = useRef<string | null>(null);
  const artistButtonRef = useRef<HTMLButtonElement>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const collectionWait = Math.max(0, Math.ceil((collectionRetryAt - now) / 1000));
  const genresWait = Math.max(0, Math.ceil((genresRetryAt - now) / 1000));

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const resize = () => {
      if (grid.clientWidth < 1 || grid.clientHeight < 1) return;
      const layout = collectionLayout(grid.clientWidth, grid.clientHeight);
      grid.style.setProperty("--collection-columns", String(layout.columns));
      grid.style.setProperty("--collection-rows", String(layout.rows));
      grid.style.setProperty("--collection-case-width", `${layout.caseWidth}px`);
      const previous = paginationRef.current;
      if (layout.capacity === previous.pageSize) return;
      const nextPage = pageForAnchor(previous.page, previous.pageSize, layout.capacity, previous.count, previous.anchorIndex);
      paginationRef.current = { ...previous, page: nextPage, pageSize: layout.capacity };
      setPage(nextPage);
      setPageSize(layout.capacity);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(grid);
    resize();
    return () => observer.disconnect();
  }, []);

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

  // Metadata enrichment never blocks the album grid or depends on a button.
  // The shared cache deduplicates requests and rejects stale auth generations.
  useEffect(() => {
    if (authenticated === true && cachedAlbums && genresState === "idle") {
      void loadCollectionGenres(authenticated)?.catch(() => undefined);
    }
  }, [authenticated, cachedAlbums, genresState]);

  // Options describe the full saved collection, before search and pagination.
  const decades = useMemo(() => collectionDecades(albums), [albums]);
  const topGenres = useMemo(() => collectionGenres(albums), [albums]);
  const years = useMemo(() => collectionYears(albums, decade), [albums, decade]);
  const filtered = useMemo(() => filterCollection(albums, query, decade, genre, year), [albums, query, decade, genre, year]);

  useEffect(() => {
    setPage(0);
  }, [query, decade, genre, year]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const anchorIndex = filtered.findIndex((album) => album.id === anchorIdRef.current);
  paginationRef.current = { page: safePage, pageSize, count: filtered.length,
    anchorIndex: anchorIndex >= safePage * pageSize && anchorIndex < (safePage + 1) * pageSize ? anchorIndex : safePage * pageSize };
  const pageItems = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  const handleSelect = useCallback((album: AlbumItem, origin: HTMLElement) => {
    anchorIdRef.current = album.id;
    openAlbum(album, origin);
  }, [openAlbum]);

  const changeDecade = (value: string) => {
    setDecade(value);
    if (!collectionYears(albums, value).some((option) => option.id === year)) setYear("all");
  };
  const clearFilters = () => { setQuery(""); setDecade("all"); setGenre("all"); setYear("all"); };
  const returnToCollection = () => {
    setExploringArtist(false);
    requestAnimationFrame(() => artistButtonRef.current?.focus());
  };

  return (
    <div
      ref={chapterRef}
      className={styles.chapter}
      data-collection-transition-lite="true"
      data-artist-exploring={exploringArtist}
    >
      <div className={styles.collectionContent} hidden={exploringArtist}>
      <div className={styles.collectionMain}>
      <header className={styles.header}>
        <h2 className={styles.screenReaderTitle}>Tu colección</h2>
        <nav className={styles.sectionNavigation} aria-label="Colección y artistas">
          <button type="button" className={styles.sectionActive} aria-current="page">Tu colección</button>
          <button ref={artistButtonRef} type="button" onClick={() => { setArtistExplorerVisited(true); setExploringArtist(true); }}>Buscar artista</button>
        </nav>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>Buscar en tu colección</span>
          <input type="search" className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artista o álbum…" aria-label="Buscar artista o álbum" />
        </label>
        <label className={styles.field}>
          <span>Género del artista</span>
          <select value={genre} onChange={(event) => setGenre(event.target.value)} aria-label="Filtrar por género">
            <option value="all">Todos</option>
            {genre !== "all" && !topGenres.some((item) => item.id === genre) && <option value={genre}>{genre} (seleccionado)</option>}
            {topGenres.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Década de edición</span>
          <select value={decade} onChange={(event) => changeDecade(event.target.value)} aria-label="Filtrar por década">
            {decades.map((item) => <option key={item.id} value={item.id}>{item.id === "all" ? "Todas" : item.label}</option>)}
          </select>
        </label>
        <label className={styles.field}>
          <span>Año de edición</span>
          <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Filtrar por año de edición">
            {years.map((item) => <option key={item.id} value={item.id}>{item.id === "all" ? "Todos" : item.label}</option>)}
          </select>
        </label>
      </div>

      {loadingGenres && <p className={styles.filterStatus} role="status">Consultando géneros de los artistas…</p>}
      {genresState === "empty" && <p className={styles.filterStatus} role="status">Sin géneros informados para estos artistas.</p>}
      {genresState === "partial" && <p className={styles.filterStatus} role="status">Géneros parciales · {genresResolvedArtists} de {genresTotalArtists} artistas consultados. Podés filtrar con los datos disponibles.</p>}
      {genresState === "error" && <p className={styles.filterStatus} role="alert">Géneros del artista: {genresError?.message}{genresError?.status === 401 && <a href="/api/auth/login"> Conectar Spotify</a>}</p>}
      {genresWait > 0 && <p className={styles.filterStatus} role="status">Reintento disponible en {genresWait} s.</p>}
      {(genresState === "partial" || genresState === "error") && <button type="button" className={styles.retryGenres} onClick={handleLoadGenres} disabled={genresWait > 0 || !albums.length}>Reintentar géneros</button>}

      {(query || decade !== "all" || genre !== "all" || year !== "all") && <div className={styles.activeFilters} aria-label="Filtros activos">
        {query && <button type="button" aria-label={`Quitar búsqueda: ${query}`} onClick={() => setQuery("")}>Búsqueda: {query} <span aria-hidden="true">×</span></button>}
        {genre !== "all" && <button type="button" aria-label={`Quitar género: ${genre}`} onClick={() => setGenre("all")}>Género: {genre} <span aria-hidden="true">×</span></button>}
        {decade !== "all" && <button type="button" aria-label={`Quitar década: ${decade}`} onClick={() => setDecade("all")}>Década: {decade === "unknown" ? "Sin fecha" : decade} <span aria-hidden="true">×</span></button>}
        {year !== "all" && <button type="button" aria-label={`Quitar año: ${year}`} onClick={() => setYear("all")}>Año: {year === "unknown" ? "Sin fecha" : year} <span aria-hidden="true">×</span></button>}
        <button type="button" className={styles.clearFilters} onClick={clearFilters}>Limpiar filtros</button>
      </div>}

      <div ref={gridRef} className={styles.gridFrame} data-page-size={pageSize} onFocusCapture={(event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-collection-album-id]");
        if (!card) return;
        anchorIdRef.current = card.dataset.collectionAlbumId ?? null;
        const index = filtered.findIndex((album) => album.id === anchorIdRef.current);
        if (index >= 0) paginationRef.current.anchorIndex = index;
      }} onWheelCapture={(event) => {
        const frame = event.currentTarget;
        // Only a genuinely overflowing grid owns vertical wheel input. A
        // regular Collection page keeps the rail's existing chapter gesture.
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && frame.scrollHeight > frame.clientHeight + 1) event.stopPropagation();
      }}>
        {collectionState === "error" ? (
          <div className={styles.emptyState} role="alert"><div>{collectionError?.message}<div className={styles.recoveryActions}><button type="button" onClick={() => { setNow(Date.now()); void loadCollection(authenticated)?.catch(() => undefined); }} disabled={collectionWait > 0}>Reintentar colección</button>{collectionError?.status === 401 && <a href="/api/auth/login">Conectar Spotify</a>}</div>{collectionWait > 0 && <p>Reintento disponible en {collectionWait} s.</p>}</div></div>
        ) : loading ? (
          <div className={styles.emptyState} role="status">Cargando colección…</div>
        ) : authenticated === false && !cachedAlbums ? (
          <div className={styles.emptyState} role="status"><p>Conectá Spotify para ver tu colección. <a href="/api/auth/login">Conectar Spotify</a></p></div>
        ) : pageItems.length === 0 ? (
          <div className={styles.emptyState} role="status">{albums.length ? "Sin resultados para estos filtros" : "Colección vacía"}</div>
        ) : (
          <div className={styles.grid}>
            {pageItems.map((album) => <JewelCaseFront key={album.id} album={album} presentation="collection" onSelect={(origin) => handleSelect(album, origin)} />)}
          </div>
        )}
      </div>

      {totalPages > 1 && <footer className={styles.footer}>
        <button type="button" className={styles.pageButton} disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</button>
        <span className={styles.pageLabel}>Página {safePage + 1} de {totalPages}</span>
        <button type="button" className={styles.pageButton} disabled={safePage >= totalPages - 1} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>Siguiente</button>
      </footer>}
      </div>
      </div>
      {artistExplorerVisited && <ArtistExplorer open={exploringArtist} active={isActiveChapter} onCollection={returnToCollection} />}
    </div>
  );
}
