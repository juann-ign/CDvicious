"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useAlbumTracks } from "@/hooks/useAlbumTracks";
import type { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";
import type { SpotifyTrack } from "@/types/spotify";
import { formatTime } from "./ProgressBar";
import styles from "./DeckTrackSelector.module.css";

interface Props {
  enabled: boolean;
  track: SpotifyTrack | null;
  controls: ReturnType<typeof useCanonicalPlayerControls>;
}

export function DeckTrackSelector({ enabled, track, controls }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const id = useId();
  const albumId = track?.album.id;
  const visible = enabled && open && Boolean(albumId);
  const { tracks, loading, error, errorMessage, canRetry, rateLimited, retry } = useAlbumTracks(albumId, visible);
  const active = track ? tracks?.find((entry) => entry.id === track.id || entry.linkedFromId === track.id) : undefined;
  const multiDisc = tracks?.some((entry) => entry.disc_number !== tracks[0].disc_number);

  useEffect(() => {
    if (!visible || active === undefined) return;
    const container = list.current;
    const row = container?.querySelector('[aria-current="true"]');
    if (!container || !row) return;
    const viewport = container.getBoundingClientRect();
    const item = row.getBoundingClientRect();
    if (item.top < viewport.top) container.scrollTop += item.top - viewport.top;
    else if (item.bottom > viewport.bottom) container.scrollTop += item.bottom - viewport.bottom;
  }, [visible, active]);

  if (!enabled || !albumId || !track) return null;

  const selectable = controls.canControl && !controls.blocked && !controls.transportPending;
  const close = () => {
    setOpen(false);
    toggle.current?.focus({ preventScroll: true });
  };
  return <div className={styles.deck} data-deck-track-selector data-track-listing-open={visible} data-lenis-prevent onKeyDown={(event) => {
    if (event.key !== "Escape" || !visible) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  }}>
    <button ref={toggle} type="button" className={styles.toggle} aria-expanded={visible}
      aria-controls={visible ? id : undefined} onClick={() => setOpen((value) => !value)}>
      <span className={styles.toggleIcon} aria-hidden="true">
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
          <path d="M1 2.5h2m-2 4.5h2m-2 4.5h2m3-9h9m-9 4.5h9m-9 4.5h9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span>Track listing</span>
      <svg className={styles.chevron} aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" fill="none">
        <path d="M3 2.5 6.5 6 3 9.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
    {visible && <section className={styles.panel} id={id} aria-label="Pistas del álbum" aria-busy={loading}>
      <header className={styles.album} title={track.album.name}>{track.album.name}</header>
      {loading ? <p role="status" className={styles.message}>Cargando pistas…</p>
        : error ? <>
          <div role="alert" className={styles.message}>
            {errorMessage ?? "No se pudieron cargar las pistas."}
            <button type="button" disabled={!canRetry} onClick={retry}>Reintentar</button>
          </div>
          {rateLimited && <p className={styles.notice} data-track-listing-partial>
            <strong>Pista actual</strong><br />{track.name}{" "}
            <span className={styles.time}>{formatTime(track.duration_ms)}</span>
          </p>}
        </>
        : !tracks?.length ? <p role="status" className={styles.message}>El álbum no informa pistas.</p>
        : <>
          {!controls.canControl && <p className={styles.notice}>Activá este reproductor en Spotify para elegir una pista.</p>}
          <ol ref={list} className={styles.list}>
            {tracks.map((entry, index) => {
              const current = entry.position === active?.position;
              const pending = Boolean(controls.pendingTrackId) && entry.id === controls.pendingTrackId;
              const available = entry.playable && entry.id !== null && entry.uri !== null;
              const disabled = !selectable || !available || current;
              return <Fragment key={entry.position}>
                {multiDisc && tracks[index - 1]?.disc_number !== entry.disc_number &&
                  <li className={styles.disc} aria-label={`Disco ${entry.disc_number}`}>CD {entry.disc_number}</li>}
                <li className={styles.item} data-alternate={index % 2 === 1 || undefined}>
                  <button type="button" className={styles.row} aria-current={current || undefined}
                    aria-disabled={disabled || undefined} data-pending={pending}
                    data-track-position={entry.position}
                    onClick={() => {
                      if (disabled || !entry.id) return;
                      void controls.selectTrack({
                        albumId, trackId: entry.id, position: entry.position, linkedFromId: entry.linkedFromId,
                      });
                      close();
                    }}>
                    <span className={styles.title}>{entry.name}</span>{" "}
                    <span className={styles.time}>{!available ? "No disponible" : pending ? "En espera" : formatTime(entry.duration_ms)}</span>
                  </button>
                </li>
              </Fragment>;
            })}
          </ol>
        </>}
    </section>}
  </div>;
}
