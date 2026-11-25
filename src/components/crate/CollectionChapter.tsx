"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { useArtistCatalog } from "@/hooks/useArtistCatalog";
import { useArtistGenres } from "@/hooks/useArtistGenres";
import {
  loadCollection,
  loadCollectionGenres,
  syncCollectionAuth,
  useCollectionCache,
} from "@/lib/collectionClient";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { JewelCaseFront } from "./JewelCaseFront";
import { useCatalogNavigation } from "./CatalogNavigation";
import { CrateShelf } from "./CrateShelf";
import { GenreVerification, type VerifiedGenre } from "./GenreVerification";
import type { AlbumItem } from "@/types/crate";
import type { ArtistItem } from "@/types/artist";
import { compareArtistEditions } from "@/lib/artistCaseLayout";
import { collectionDecades, collectionGenres, collectionYears, filterCollection, normalizeGenres } from "@/lib/collectionFilters";
import styles from "./CollectionChapter.module.css";
import { collectionLayout, pageForAnchor } from "@/lib/collectionLayout";
import { exactAlbumSearch } from "@/lib/searchText";

export function CollectionChapter() {
  const { authenticated, query, view, search, changeQuery, finishOpeningAlbum } = useCatalogNavigation();
  const artist = view.kind === "artist" ? view.artist : null;
  const pickedAlbum = view.kind === "album" ? view.album : null;
  const exploringArtist = Boolean(artist);
  const searchingCatalog = view.kind === "grid" && Boolean(query.trim());
  const [genrePanelOpen, setGenrePanelOpen] = useState(false);
  const genreSelect = useRef<HTMLSelectElement>(null);
  const { openAlbum } = useAlbumDetailActions();
  const { stop, start } = useRailActions();
  const dragLock = useRef(Symbol("artist-shelf-drag"));
  const { albums: cachedAlbums, collectionState, collectionError, collectionRetryAt, genresState, genresError, genresRetryAt, genresResolvedArtists, genresTotalArtists } = useCollectionCache();
  const albums = useMemo(() => cachedAlbums ?? [], [cachedAlbums]);
  const loading = collectionState === "loading" || (collectionState === "idle" && !cachedAlbums && authenticated !== false);
  const loadingGenres = genresState === "loading";
  const [isActiveChapter, setIsActiveChapter] = useState(false);
  const artistActive = isActiveChapter && exploringArtist && authenticated === true;
  const artistCatalog = useArtistCatalog(artist?.id, "album", artistActive);
  const artistGenres = useArtistGenres(artist?.id, artistActive);
  // The first visible edition must be the oldest even when the provider sends
  // newer releases on its first page. Preserve any partial results on failure.
  const catalogHasOrder = artistCatalog.nextOffset === null || artistCatalog.error !== null;
  const [decade, setDecade] = useState("all");
  const [genre, setGenre] = useState("all");
  const [verification, setVerification] = useState<VerifiedGenre | null>(null);
  const [year, setYear] = useState("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const paginationRef = useRef({ page: 0, pageSize: 16, count: 0, anchorIndex: 0 });
  const anchorIdRef = useRef<string | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now);
  const collectionWait = Math.max(0, Math.ceil((collectionRetryAt - now) / 1000));
  const genresWait = Math.max(0, Math.ceil((genresRetryAt - now) / 1000));

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const resize = () => {
      if (grid.hidden) return;
      const layout = collectionLayout(grid.clientWidth, grid.clientHeight);
      grid.style.setProperty("--collection-columns", String(layout.columns));
      grid.style.setProperty("--collection-case-width", `${layout.caseWidth}px`);
      grid.style.setProperty("--collection-gap", `${layout.gap}px`);
      grid.style.setProperty("--collection-row-gap", `${layout.rowGap}px`);
      grid.style.setProperty("--collection-padding", `${layout.padding}px`);
      grid.style.setProperty("--collection-card-height", `${layout.cardHeight}px`);
      const previous = paginationRef.current;
      setPageSize(layout.capacity);
      if (!layout.capacity || layout.capacity === previous.pageSize) return;
      const nextPage = pageForAnchor(previous.page, previous.pageSize, layout.capacity, previous.count, previous.anchorIndex);
      paginationRef.current = { ...previous, page: nextPage, pageSize: layout.capacity };
      setPage(nextPage);
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
    if (authenticated === false) setVerification(null);
  }, [authenticated]);

  useEffect(() => {
    setGenrePanelOpen(false);
  }, [isActiveChapter, artist?.id, pickedAlbum?.id]);

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
    void loadCollectionGenres(authenticated, true)?.catch(() => undefined);
  }, [authenticated, loadingGenres, genresWait]);

  // Metadata enrichment never blocks the album grid or depends on a button.
  // The shared cache deduplicates requests and rejects stale auth generations.
  useEffect(() => {
    if (authenticated === true && cachedAlbums && genresState === "idle") {
      void loadCollectionGenres(authenticated)?.catch(() => undefined);
    }
  }, [authenticated, cachedAlbums, genresState]);

  const pickedGenres = useMemo(() => normalizeGenres([...(artist?.genres ?? []), ...artistGenres.genres]),
    [artist?.genres, artistGenres.genres]);
  const artistAlbums = useMemo(() => {
    const saved = new Map(albums.map((album) => [album.id, album]));
    return [...artistCatalog.items].sort(compareArtistEditions).map((album) => {
      const stored = saved.get(album.id);
      return { ...album, genres: normalizeGenres([...(album.genres ?? []), ...(stored?.genres ?? []), ...pickedGenres]),
        genreMetadata: album.genreMetadata ?? stored?.genreMetadata };
    });
  }, [albums, artistCatalog.items, pickedGenres]);
  const gridAlbums = useMemo(() => {
    if (pickedAlbum) return [albums.find(({ id }) => id === pickedAlbum.id) ?? pickedAlbum];
    if (!searchingCatalog || !search.result?.albums.length) return albums;
    const byId = new Map(albums.map((album) => [album.id, album]));
    for (const album of search.result.albums) if (!byId.has(album.id)) byId.set(album.id, album);
    return [...byId.values()];
  }, [albums, pickedAlbum, search.result, searchingCatalog]);
  // Options cover the entire active catalog before filtering and pagination.
  const filterScope = artist ? artistAlbums : gridAlbums;
  const decades = useMemo(() => collectionDecades(filterScope), [filterScope]);
  const topGenres = useMemo(() => collectionGenres(filterScope), [filterScope]);
  const years = useMemo(() => collectionYears(filterScope, decade), [filterScope, decade]);
  const verificationActive = verification?.genre === genre ? verification : null;
  const matchingIds = useMemo(() => new Set(verificationActive?.matchedArtistIds), [verificationActive]);
  const genreFilter = useCallback((album: AlbumItem, selectedArtistId?: string) =>
    !verificationActive || normalizeGenres(album.genres).includes(genre) ||
    Boolean(selectedArtistId && matchingIds.has(selectedArtistId)) || album.artists.some(({ id }) => matchingIds.has(id)),
  [genre, matchingIds, verificationActive]);
  const textMatches = useMemo(() => {
    if (!searchingCatalog) return gridAlbums;
    const matches = filterCollection(gridAlbums, query, "all", "all");
    const exact = matches.filter((album) => exactAlbumSearch(album, query));
    if (!exact.length) return matches;
    const savedIds = new Set(albums.map(({ id }) => id));
    const savedExact = exact.filter(({ id }) => savedIds.has(id));
    return savedExact.length ? savedExact : exact;
  }, [albums, gridAlbums, query, searchingCatalog]);
  const filtered = useMemo(() => filterCollection(textMatches, "", decade, verificationActive ? "all" : genre, year)
    .filter((album) => genreFilter(album)), [textMatches, decade, genre, year, verificationActive, genreFilter]);
  const filteredArtist = useMemo(() => filterCollection(artistAlbums, "", decade, verificationActive ? "all" : genre, year)
    .filter((album) => genreFilter(album, artist?.id)), [artist?.id, artistAlbums, decade, genre, year, verificationActive, genreFilter]);
  const verificationArtists = useMemo(() => {
    if (artist) return [artist];
    const found = new Map<string, Pick<ArtistItem, "id" | "name">>();
    for (const album of filterCollection(textMatches, "", decade, "all", year)) {
      for (const artist of album.artists) if (!found.has(artist.id)) found.set(artist.id, artist);
    }
    return [...found.values()];
  }, [artist, decade, textMatches, year]);
  const checkedForContext = verificationActive ? verificationArtists.filter(({ id }) => verificationActive.checkedArtistIds.includes(id)).length : 0;
  const genreState = artist ? artistGenres.state : genresState;
  const genreError = artist ? artistGenres.error : genresError;
  const genreWait = artist ? artistGenres.waitSeconds : genresWait;
  const canRetryGenres = genreState === "partial" || genreState === "error" || genreState === "unavailable";
  const offerVerification = authenticated === true && verificationArtists.length > 0;
  const genreNotice = genreState === "loading" ? "Consultando géneros de los artistas…"
    : genreState === "empty" ? "Sin géneros informados para estos artistas."
      : genreState === "unavailable" ? "Spotify no informó géneros en las fichas de estos artistas."
        : genreState === "partial" ? `Géneros parciales · ${genresResolvedArtists} de ${genresTotalArtists} artistas consultados.`
          : genreState === "error" ? genreError?.message : null;

  useEffect(() => {
    setPage(0);
  }, [query, pickedAlbum?.id, decade, genre, year]);

  // Keep the last usable page geometry while a temporarily short frame has no rows.
  const anchorPageSize = pageSize || paginationRef.current.pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / anchorPageSize));
  const safePage = Math.min(page, totalPages - 1);
  const anchorIndex = filtered.findIndex((album) => album.id === anchorIdRef.current);
  paginationRef.current = { page: safePage, pageSize: anchorPageSize, count: filtered.length,
    anchorIndex: anchorIndex >= safePage * anchorPageSize && anchorIndex < (safePage + 1) * anchorPageSize ? anchorIndex : safePage * anchorPageSize };
  const pageItems = filtered.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize,
  );

  const handleSelect = useCallback((album: AlbumItem, origin: HTMLElement) => {
    anchorIdRef.current = album.id;
    openAlbum(album, origin);
  }, [openAlbum]);

  const clearFilters = useCallback(() => { setDecade("all"); setGenre("all"); setYear("all"); }, []);
  useEffect(() => {
    if (!isActiveChapter || view.kind !== "album" || !view.openOnArrival) return;
    if (!filtered.length) {
      clearFilters();
      return;
    }
    const origin = pageSize
      ? gridRef.current?.querySelector<HTMLElement>("[data-collection-album-id]")
      : document.querySelector<HTMLElement>("[data-nav-catalog-search] input");
    if (!origin || origin.closest("[inert]")) return;
    handleSelect(filtered[0], origin);
    finishOpeningAlbum(view.album.id);
  }, [clearFilters, filtered, finishOpeningAlbum, handleSelect, isActiveChapter, pageSize, view]);

  const changeDecade = (value: string) => {
    setDecade(value);
    if (!collectionYears(filterScope, value).some((option) => option.id === year)) setYear("all");
  };
  const unselectArtist = () => {
    changeQuery("");
    document.querySelector<HTMLElement>("[data-nav-catalog-search] input")?.focus({ preventScroll: true });
  };
  const applyVerification = (result: VerifiedGenre) => {
    setVerification((previous) => previous?.genre === result.genre ? {
      ...result,
      matchedArtistIds: [...new Set([...previous.matchedArtistIds, ...result.matchedArtistIds])],
      checkedArtistIds: [...new Set([...previous.checkedArtistIds, ...result.checkedArtistIds])],
    } : result);
    setGenre(result.genre);
  };
  const grabArtistShelf = useCallback(() => stop(dragLock.current), [stop]);
  const releaseArtistShelf = useCallback(() => start(dragLock.current), [start]);
  const hasActiveFilters = decade !== "all" || genre !== "all" || year !== "all";

  return (
    <div
      ref={chapterRef}
      className={styles.chapter}
      data-collection-transition-lite="true"
      data-artist-exploring={exploringArtist}
    >
      <div className={styles.collectionMain}>
      <div className={styles.controls}>
      <h2 className={styles.title}>{artist ? "Discografía" : searchingCatalog || pickedAlbum ? "Resultados" : "Tu colección"}</h2>

      <div className={styles.toolbar}>
        <div className={`${styles.field} ${styles.genreField}`} onBlur={(event) => {
          if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setGenrePanelOpen(false);
        }} onKeyDown={(event) => {
          if (event.key !== "Escape" || !genrePanelOpen) return;
          event.preventDefault();
          event.stopPropagation();
          setGenrePanelOpen(false);
          genreSelect.current?.focus();
        }}>
          <div className={styles.fieldTitle}>
            <label htmlFor="collection-genre">Género del artista</label>
            {(offerVerification || genreNotice) && <button type="button" className={styles.genreDisclosure} aria-expanded={genrePanelOpen}
              aria-controls="collection-genre-panel" aria-label="Buscar género en Spotify" onClick={() => setGenrePanelOpen(!genrePanelOpen)}>Opciones</button>}
          </div>
          <select ref={genreSelect} id="collection-genre" value={genre} onChange={(event) => {
            if (event.target.value === "__verify") setGenrePanelOpen(true);
            else { setGenre(event.target.value); setGenrePanelOpen(false); }
          }} aria-label="Filtrar por género">
            <option value="all">Todos</option>
            {genre !== "all" && !topGenres.some((item) => item.id === genre) && <option value={genre}>{genre} {verificationActive ? "(verificado)" : "(seleccionado)"}</option>}
            {topGenres.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            {offerVerification && <option value="__verify">Buscar en Spotify…</option>}
          </select>
          {genrePanelOpen && <div className={styles.genrePanel} id="collection-genre-panel" data-lenis-prevent>
            {genreNotice && <p role="status">{genreNotice}
              {genreError?.status === 401 && <a href="/api/auth/login"> Conectar Spotify</a>}
            </p>}
            {genreWait > 0 && <p role="status">Reintento disponible en {genreWait} s.</p>}
            {offerVerification && <GenreVerification key={artist?.id ?? "saved"}
              artists={verificationArtists} previous={verification} onApply={applyVerification} />}
            {verificationActive && verificationArtists.length > 0 && <p role="status">
              Género comprobado en Spotify · {checkedForContext} de {verificationArtists.length} artistas.
              {checkedForContext < verificationArtists.length && " Resultados parciales."}
            </p>}
            {canRetryGenres && <button type="button" className={styles.retryGenres}
              onClick={artist ? artistGenres.retry : handleLoadGenres} disabled={genreWait > 0 || (!artist && !albums.length)}>
              Reintentar géneros
            </button>}
          </div>}
        </div>
        <label className={styles.field}>
          <span>Década de edición</span>
          <select value={decade} onChange={(event) => changeDecade(event.target.value)} aria-label="Filtrar por década">
            {decades.map((item) => <option key={item.id} value={item.id}>{item.id === "all" ? "Todas" : item.label}</option>)}
            {decade !== "all" && !decades.some((item) => item.id === decade) && <option value={decade}>{decade === "unknown" ? "Sin fecha" : decade}</option>}
          </select>
        </label>
        <label className={styles.field}>
          <span>Año de edición</span>
          <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Filtrar por año de edición">
            {years.map((item) => <option key={item.id} value={item.id}>{item.id === "all" ? "Todos" : item.label}</option>)}
            {year !== "all" && !years.some((item) => item.id === year) && <option value={year}>{year === "unknown" ? "Sin fecha" : year}</option>}
          </select>
        </label>
      </div>
      </div>

      {(artist || hasActiveFilters) && <div className={styles.activeFilters} aria-label="Filtros activos">
        {artist && <button type="button" className={styles.artistChip} aria-label={`Quitar artista: ${artist.name}`} onClick={unselectArtist}>
          {artist.name} <span aria-hidden="true">×</span>
        </button>}
        {genre !== "all" && <button type="button" aria-label={`Quitar género: ${genre}`} onClick={() => setGenre("all")}>Género: {genre} <span aria-hidden="true">×</span></button>}
        {decade !== "all" && <button type="button" aria-label={`Quitar década: ${decade}`} onClick={() => setDecade("all")}>Década: {decade === "unknown" ? "Sin fecha" : decade} <span aria-hidden="true">×</span></button>}
        {year !== "all" && <button type="button" aria-label={`Quitar año: ${year}`} onClick={() => setYear("all")}>Año: {year === "unknown" ? "Sin fecha" : year} <span aria-hidden="true">×</span></button>}
        {hasActiveFilters && <button type="button" className={styles.clearFilters}
          onClick={() => { clearFilters(); if (view.kind === "grid") changeQuery(""); }}>Limpiar filtros</button>}
      </div>}

      <div ref={gridRef} className={styles.gridFrame} hidden={exploringArtist} data-page-size={pageSize} onFocusCapture={(event) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>("[data-collection-album-id]");
        if (!card) return;
        anchorIdRef.current = card.dataset.collectionAlbumId ?? null;
        const index = filtered.findIndex((album) => album.id === anchorIdRef.current);
        if (index >= 0) paginationRef.current.anchorIndex = index;
      }}>
        {collectionState === "error" && !searchingCatalog && !pickedAlbum ? (
          <div className={styles.emptyState} role="alert"><div>{collectionError?.message}<div className={styles.recoveryActions}><button type="button" onClick={() => { setNow(Date.now()); void loadCollection(authenticated)?.catch(() => undefined); }} disabled={collectionWait > 0}>Reintentar colección</button>{collectionError?.status === 401 && <a href="/api/auth/login">Conectar Spotify</a>}</div>{collectionWait > 0 && <p>Reintento disponible en {collectionWait} s.</p>}</div></div>
        ) : loading && !searchingCatalog && !pickedAlbum ? (
          <div className={styles.emptyState} role="status">Cargando colección…</div>
        ) : authenticated === false && !cachedAlbums ? (
          <div className={styles.emptyState} role="status"><p>Conectá Spotify para ver tu colección. <a href="/api/auth/login">Conectar Spotify</a></p></div>
        ) : searchingCatalog && !textMatches.length && search.loading ? (
          <div className={styles.emptyState} role="status">Buscando discos…</div>
        ) : searchingCatalog && !textMatches.length && search.error ? (
          <div className={styles.emptyState} role="alert"><div>{search.error.message}
            <div className={styles.recoveryActions}><button type="button" onClick={search.retry}>Reintentar búsqueda</button></div>
          </div></div>
        ) : !pageSize && filtered.length > 0 ? (
          <div className={styles.emptyState} role="status">Ampliá la ventana para ver los discos.</div>
        ) : pageItems.length === 0 ? (
          <div className={styles.emptyState} role="status">{searchingCatalog || gridAlbums.length ? "Sin resultados para estos filtros" : "Colección vacía"}</div>
        ) : (
          <div className={styles.grid}>
            {pageItems.map((album) => <JewelCaseFront key={album.id} album={album} presentation="collection" onSelect={(origin) => handleSelect(album, origin)} />)}
          </div>
        )}
      </div>

      {!exploringArtist && <footer className={styles.footer}>
        {pageSize > 0 && totalPages > 1 && <>
          <button type="button" className={styles.pageButton} disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Anterior</button>
          <span className={styles.pageLabel}>Página {safePage + 1} de {totalPages}</span>
          <button type="button" className={styles.pageButton} disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Siguiente</button>
        </>}
      </footer>}
      {exploringArtist && <section className={styles.artistArea} aria-label={artist ? `Discos de ${artist.name}` : "Discos del artista"}
        data-testid="artist-discography" data-artist-id={artist?.id}>
        {artistCatalog.error && <div className={styles.artistNotice} role="alert">
          {artistCatalog.error.message} <button type="button" className={styles.retryGenres} onClick={artistCatalog.retry}>Reintentar catálogo</button>
          {artistCatalog.error.status === 401 && <a href="/api/auth/login"> Conectar Spotify</a>}
        </div>}
        {artistCatalog.loading && <p className={styles.artistNotice} role="status">Cargando discos…</p>}
        {filteredArtist.length > 0 && artist && catalogHasOrder ? <CrateShelf key={artist.id} mode="ordered" startAt="center"
          albums={filteredArtist} chapterIndex={3} active={authenticated === true} label="Páginas de los discos del artista"
          onSelect={openAlbum} onGrabStart={grabArtistShelf} onGrabEnd={releaseArtistShelf} />
          : !artistCatalog.loading && !artistCatalog.error && <div className={styles.emptyState} role="status">
            {authenticated === false ? <p>Conectá Spotify para buscar artistas. <a href="/api/auth/login">Conectar Spotify</a></p>
              : !artist ? "Elegí un artista en el buscador." : artistAlbums.length ? "Sin resultados para estos filtros" : "Este artista no tiene álbumes disponibles."}
          </div>}
      </section>}
      </div>
    </div>
  );
}
