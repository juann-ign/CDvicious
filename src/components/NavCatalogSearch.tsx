"use client";

import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { useCatalogSearch } from "@/hooks/useCatalogSearch";
import { collectionYear } from "@/lib/collectionFilters";
import type { ArtistItem } from "@/types/artist";
import type { AlbumItem } from "@/types/crate";
import styles from "./NavCatalogSearch.module.css";

export interface NavCatalogSearchProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  onSelectAlbum: (album: AlbumItem, origin: HTMLButtonElement) => void;
  onSelectArtist: (artist: ArtistItem) => void;
  authenticated: boolean | null;
  search: ReturnType<typeof useCatalogSearch>;
  className?: string;
}

type SearchOption = { key: string; kind: "artist"; artist: ArtistItem }
  | { key: string; kind: "album"; album: AlbumItem; preview: boolean };

const MAX_OPTIONS = 6;

function CatalogArt({ url, artist = false }: { url?: string; artist?: boolean }) {
  return <span className={`${styles.art} ${artist ? styles.artistArt : ""}`} aria-hidden="true">
    {url ? <Image src={url} alt="" fill sizes="64px" unoptimized /> : <svg viewBox="0 0 32 32" fill="none">
      {artist ? <><circle cx="16" cy="11" r="5" /><path d="M6 27v-3a10 10 0 0 1 20 0v3" /></>
        : <><rect x="4" y="4" width="24" height="24" /><circle cx="17" cy="16" r="8" /><circle cx="17" cy="16" r="2" /><path d="M8 4v24" /></>}
    </svg>}
  </span>;
}

/** One controlled query and result set are shared with the Collection screen. */
export function NavCatalogSearch({ query, onQueryChange, onSubmit, onSelectAlbum, onSelectArtist, authenticated, search, className }: NavCatalogSearchProps) {
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const optionNodes = useRef(new Map<string, HTMLButtonElement>());
  const suppressFocus = useRef(false);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const term = query.trim();
  const result = search.result;
  const preview = result?.kind === "artist" && search.preview?.artistId === result.artists[0]?.id ? search.preview : null;
  const options = useMemo<SearchOption[]>(() => {
    if (!result) return [];
    const artists = [...new Map(result.artists.map((artist) => [artist.id, artist])).values()];
    const artistOptions = artists.map((artist): SearchOption => ({ key: `artist:${artist.id}`, kind: "artist", artist }));
    const albums = [...new Map([...(preview?.albums ?? []), ...result.albums].map((album) => [album.id, album])).values()];
    if (result.kind === "artist") {
      const chronological = albums.sort((a, b) =>
        (collectionYear(a.release_date) === "unknown" ? "9999" : a.release_date!).localeCompare(collectionYear(b.release_date) === "unknown" ? "9999" : b.release_date!) || a.id.localeCompare(b.id)).slice(0, 3);
      return [...artistOptions.slice(0, 1), ...chronological.map((album): SearchOption => ({ key: `album:${album.id}`, kind: "album", album, preview: true })), ...artistOptions.slice(1)].slice(0, MAX_OPTIONS);
    }
    const visibleAlbums = albums.slice(0, MAX_OPTIONS - Number(artistOptions.length > 0));
    return [...visibleAlbums.map((album): SearchOption => ({ key: `album:${album.id}`, kind: "album", album, preview: false })), ...artistOptions].slice(0, MAX_OPTIONS);
  }, [result, preview]);
  const active = options.findIndex((option) => option.key === highlight);
  const visible = open;
  const pending = authenticated === null || authenticated === true && Boolean(term) && (search.loading || !result && !search.error);
  const previewPending = Boolean(preview?.loading);
  const error = search.error ?? preview?.error;
  const retryWait = error?.status === 429 ? Math.max(0, Math.ceil((error.retryAt - now) / 1000)) : 0;

  const focusInput = () => {
    suppressFocus.current = true;
    input.current?.focus({ preventScroll: true });
    suppressFocus.current = false;
  };
  const close = (restore = false) => {
    setOpen(false); setHighlight(null);
    if (restore) focusInput();
  };
  const submit = () => { close(); onSubmit(); };
  const choose = (option: SearchOption, origin?: HTMLButtonElement) => {
    const albumOrigin = origin ?? optionNodes.current.get(option.key);
    close(); focusInput();
    if (option.kind === "artist") onSelectArtist(option.artist);
    else if (albumOrigin) onSelectAlbum(option.album, albumOrigin);
  };

  useEffect(() => { setHighlight(null); }, [query]);
  useEffect(() => {
    if (!open || error?.status !== 429) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [error, open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setHighlight(null); }
    };
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, [open]);
  useEffect(() => {
    if (!visible || active < 0) return;
    const option = optionNodes.current.get(options[active].key);
    const list = option?.parentElement;
    if (!option || !list) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [active, options, visible]);

  return <div ref={root} className={[styles.search, className].filter(Boolean).join(" ")} data-nav-catalog-search
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={(event) => {
      if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); close(true); }
    }}>
    <form role="search" aria-label="Buscar en el catálogo" className={styles.face} onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <span className={styles.searchIcon} data-search-pending={pending || previewPending} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none"><circle cx="8" cy="8" r="5" /><path d="m12 12 5 5" /></svg>
      </span>
      <input ref={input} type="search" role="combobox" aria-label="Buscar discos o artistas" autoComplete="off" spellCheck={false}
        placeholder="Discos o artistas…" value={query} aria-autocomplete="list" aria-expanded={visible}
        aria-controls={visible ? listId : undefined} aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
        onFocus={() => { if (!suppressFocus.current) setOpen(true); }}
        onChange={(event) => { setHighlight(null); setOpen(true); onQueryChange(event.target.value); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); event.stopPropagation(); setOpen(true);
            if (options.length) setHighlight(options[event.key === "ArrowDown" ? (active + 1) % options.length : active <= 0 ? options.length - 1 : active - 1].key);
          } else if ((event.key === "Home" || event.key === "End") && visible && active >= 0 && options.length && !event.metaKey && !event.ctrlKey) {
            event.preventDefault(); event.stopPropagation(); setHighlight(options[event.key === "Home" ? 0 : options.length - 1].key);
          } else if (event.key === "Enter") {
            event.preventDefault(); event.stopPropagation();
            if (visible && active >= 0) choose(options[active]); else submit();
          }
        }} />
      {query && <button type="button" className={styles.clear} aria-label="Limpiar búsqueda" onClick={() => { onQueryChange(""); setHighlight(null); setOpen(true); focusInput(); }}>
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>}
      <button type="submit" className={styles.submit} aria-label="Buscar en Colección" title="Buscar en Colección">
        <svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M14 3v8H4m4-4-4 4 4 4" /></svg>
      </button>
    </form>
    {visible && <section className={styles.popup} data-testid="nav-catalog-search-results" data-lenis-prevent>
      <header className={styles.heading}>
        <span><i aria-hidden="true" />RESULTADOS</span>
        <button type="button" aria-label="Cerrar búsqueda" className={styles.close} onClick={() => close(true)}>Cerrar <span aria-hidden="true">×</span></button>
      </header>
      <div id={listId} role="listbox" aria-label="Resultados de búsqueda" aria-busy={pending || previewPending} className={styles.results}>
        {authenticated === true && options.map((option, index) => option.kind === "artist" ? <button key={option.key} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1}
          ref={(node) => { if (node) optionNodes.current.set(option.key, node); else optionNodes.current.delete(option.key); }}
          className={`${styles.option} ${styles.artistOption}`} data-search-kind="artist" data-artist-id={option.artist.id}
          aria-label={`Explorar artista ${option.artist.name}`} aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()} onPointerMove={() => setHighlight(option.key)} onClick={() => choose(option)}>
          <CatalogArt url={option.artist.images[0]?.url} artist />
          <span className={styles.optionText}><small>ARTISTA</small><strong>{option.artist.name}</strong><span>Explorar discografía <b aria-hidden="true">→</b></span></span>
        </button> : <button key={option.key} id={`${listId}-${index}`} type="button" role="option" tabIndex={-1}
          ref={(node) => { if (node) optionNodes.current.set(option.key, node); else optionNodes.current.delete(option.key); }}
          className={styles.option} data-search-kind="album" data-album-id={option.album.id} data-search-preview={option.preview || undefined}
          aria-label={`${option.album.artists.map((artist) => artist.name).join(", ")} — ${option.album.name}`} aria-selected={active === index}
          onMouseDown={(event) => event.preventDefault()} onPointerMove={() => setHighlight(option.key)} onClick={(event) => choose(option, event.currentTarget)}>
          <CatalogArt url={option.album.images[0]?.url} />
          <span className={styles.optionText}><small>{option.preview ? "DISCOGRAFÍA" : "ÁLBUM"}</small><strong>{option.album.name}</strong><span>{option.album.artists.map((artist) => artist.name).join(", ")}</span></span>
          <span className={styles.year} data-search-year>{collectionYear(option.album.release_date) === "unknown" ? "Sin fecha" : collectionYear(option.album.release_date)}</span>
        </button>)}
      </div>
      {authenticated === false ? <p className={styles.message} role="status">Conectá Spotify para buscar en el catálogo. <a href="/api/auth/login">Conectar Spotify</a></p>
        : !term ? <p className={styles.message} role="status">Buscá un disco, un artista o ambos.</p>
          : pending ? <p className={styles.message} role="status">Buscando discos y artistas…</p>
            : !error && !options.length && <p className={styles.message} role="status">Sin resultados para “{term}”.</p>}
      {authenticated === true && previewPending && !pending && <p className={styles.message} role="status">Cargando discografía…</p>}
      {authenticated === true && error && <div className={styles.error} role="status">
        <p>{options.length ? "Se muestran los resultados disponibles. " : ""}{error.message}</p>
        {error.status === 401 ? <a href="/api/auth/login">Conectar Spotify</a> : <button type="button" onClick={search.retry} disabled={retryWait > 0}>{retryWait > 0 ? `Reintentar en ${retryWait} s` : "Reintentar"}</button>}
      </div>}
      {term && authenticated === true && <footer className={styles.footer}>
        <button type="button" onClick={submit}>Buscar “{term}” <span aria-hidden="true">↵</span></button>
        {process.env.NEXT_PUBLIC_SPOTIFY_MOCK !== "1" && <a href={`https://open.spotify.com/search/${encodeURIComponent(term)}`} target="_blank" rel="noopener noreferrer">Spotify ↗</a>}
      </footer>}
    </section>}
  </div>;
}
