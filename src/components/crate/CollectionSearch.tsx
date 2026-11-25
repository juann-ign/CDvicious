"use client";

import { useId, useMemo, useState, type RefObject } from "react";
import { findAlbumArtistMatches, matchesSearchText, normalizeSearchText, rankArtistMatches } from "@/lib/searchText";
import type { useArtistSearch } from "@/hooks/useArtistSearch";
import type { ArtistItem } from "@/types/artist";
import type { AlbumItem } from "@/types/crate";
import styles from "./CollectionChapter.module.css";

interface Props {
  search: ReturnType<typeof useArtistSearch>;
  input: RefObject<HTMLInputElement | null>;
  artists: readonly ArtistItem[];
  albums: readonly AlbumItem[];
  selectedArtist: ArtistItem | null;
  artistMode: boolean;
  expanded: boolean;
  setExpanded(value: boolean): void;
  change(value: string): void;
  select(artist: ArtistItem): void;
}

const OPTION_LIMIT = 6;

export function CollectionSearch({ search, input, artists, albums, selectedArtist, artistMode, expanded, setExpanded, change, select }: Props) {
  const listId = useId();
  const [highlight, setHighlight] = useState(-1);
  const term = normalizeSearchText(search.query);
  const matches = useMemo(() => {
    if (!term) return [];
    const namedArtists = artists.filter((artist) => matchesSearchText(term, artist.name));
    const candidates = [...namedArtists, ...(search.result?.items ?? []), ...findAlbumArtistMatches(albums, term)];
    const demoNames = new Set(candidates.filter(({ id }) => id.startsWith("demo-"))
      .map(({ name }) => normalizeSearchText(name)));
    return rankArtistMatches(candidates.filter((artist) =>
      !(artist.id.startsWith("mock-artist-") && demoNames.has(normalizeSearchText(artist.name))),
    ), term).slice(0, OPTION_LIMIT);
  }, [albums, artists, search.result, term]);
  const visible = Boolean(expanded && term && (artistMode || matches.length > 0));
  const active = highlight >= 0 && highlight < matches.length ? highlight : -1;
  const choose = (artist: ArtistItem) => {
    setExpanded(false);
    setHighlight(-1);
    select(artist);
  };
  const label = artistMode ? "Buscar artistas" : "Buscar artista o álbum";

  return <div className={`${styles.field} ${styles.searchField}`} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setExpanded(false); setHighlight(-1); }
  }}>
    <label htmlFor={`${listId}-input`}>{artistMode ? "Buscar artista o álbum" : "Buscar en tu colección"}</label>
    <input ref={input} id={`${listId}-input`} type="search" role={artistMode ? "combobox" : undefined}
      className={styles.search} autoComplete="off" value={search.query} aria-label={label}
      placeholder={selectedArtist ? "Otro artista o un disco…" : "Artista, disco o ambos…"} aria-autocomplete="list"
      aria-controls={visible ? listId : undefined} aria-expanded={artistMode ? visible : undefined}
      aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
      onFocus={() => setExpanded(true)}
      onChange={(event) => { setHighlight(-1); setExpanded(true); change(event.target.value); }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape" && visible) {
          event.preventDefault(); event.stopPropagation(); setExpanded(false); setHighlight(-1);
        } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && matches.length) {
          event.preventDefault(); event.stopPropagation(); setExpanded(true);
          setHighlight(event.key === "ArrowDown" ? (active + 1) % matches.length
            : active <= 0 ? matches.length - 1 : active - 1);
        } else if (event.key === "Enter" && visible && (active >= 0 || artistMode && matches.length)) {
          event.preventDefault(); event.stopPropagation(); choose(matches[Math.max(0, active)]);
        }
      }} />
    {visible && <div className={styles.suggestions} data-lenis-prevent>
      <ul className={styles.suggestionList} id={listId} role="listbox" aria-label="Resultados de artistas">
        {matches.map((artist, index) => <li key={artist.id} id={`${listId}-${index}`} role="option"
          aria-selected={active === index} data-artist-id={artist.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(artist)}>{artist.name}{artist.matchedAlbum && <small>{artist.matchedAlbum.name}</small>}</li>)}
      </ul>
      {search.loading && !matches.length && <p role="status">Buscando artistas y discos…</p>}
      {search.error && <p role="status">{search.error.message} {search.error.status === 401
        ? <a href="/api/auth/login">Conectar Spotify</a> : <button type="button" onClick={search.retry}>Reintentar</button>}</p>}
      {!search.loading && !search.error && search.result && !matches.length && <p role="status">Sin sugerencias para esta búsqueda.</p>}
    </div>}
  </div>;
}
