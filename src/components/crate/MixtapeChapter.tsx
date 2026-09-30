"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRail } from "@/components/scroll/RailContext";
import type { AlbumItem } from "@/types/crate";
import styles from "./MixtapeChapter.module.css";

const QUEUE_LIMIT = 8;
const PICK_COUNT = 6;

export interface MixtapePlaylistPayload {
  name: string;
  uris: string[];
}

export interface MixtapeSpotifyBridge {
  exportPlaylist: (payload: MixtapePlaylistPayload) => Promise<void>;
}

export function toSpotifyPlaylistPayload(
  queue: AlbumItem[],
): MixtapePlaylistPayload {
  return {
    name: "CDvicious — Mixtape Lab",
    uris: queue.map((album) => album.uri),
  };
}

function albumLabel(album: AlbumItem) {
  return album.artists.map((artist) => artist.name).join(", ");
}

export function MixtapeChapter({
  spotifyBridge,
}: {
  spotifyBridge?: MixtapeSpotifyBridge;
}) {
  const { stop, start } = useRail();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [queue, setQueue] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [isNearChapter, setIsNearChapter] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const chapterRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);
  const requestStartedRef = useRef(false);
    const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const chapter = chapterRef.current;
    const wrapper = chapter?.closest<HTMLElement>('[aria-label="Horizontal rail"]');

    if (!chapter || !wrapper) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearChapter(
          entry.isIntersecting && entry.intersectionRatio >= 0.9,
        );
      },
      { root: wrapper, threshold: [0, 0.9, 1] },
    );

    observer.observe(chapter);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      !isNearChapter ||
      loadedRef.current ||
      requestStartedRef.current ||
      quotaExceeded
    ) return;

    requestStartedRef.current = true;

    let cancelled = false;

    const clearTimers = () => {
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }

      if (countdownTimerRef.current !== null) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };

    const load = async () => {
      setLoading(true);

      try {
        const res = await fetch("/api/collection?includeGenres=0", {
          cache: "no-store",
        });

        if (res.status === 429) {
          const body = (await res.json().catch(() => null)) as {
            reason?: string;
          } | null;

          if (body?.reason === "QUOTA_EXCEEDED") {
            setLoading(false);
            setRateLimitSeconds(null);
            setQuotaExceeded(true);
            clearTimers();
            return;
          }

          const retryAfter = Number(res.headers.get("retry-after") ?? "60");
          const seconds =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
          let remaining = seconds;

          setLoading(false);
          setRateLimitSeconds(remaining);
          clearTimers();

          countdownTimerRef.current = setInterval(() => {
            remaining = Math.max(0, remaining - 1);
            setRateLimitSeconds(remaining);
            if (remaining === 0) {
              clearInterval(countdownTimerRef.current!);
              countdownTimerRef.current = null;
            }
          }, 1000);

          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            requestStartedRef.current = false;
            setRateLimitSeconds(null);
            void load();
          }, seconds * 1000);
          return;
        }

        if (!res.ok) {
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (!cancelled && Array.isArray(data)) {
          clearTimers();
          loadedRef.current = true;
          setAlbums(data);
          setRateLimitSeconds(null);
          setQuotaExceeded(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [isNearChapter, quotaExceeded]);

  const pickedAlbums = useMemo(() => albums.slice(0, PICK_COUNT), [albums]);

  const queueIds = useMemo(
    () => new Set(queue.map((album) => album.id)),
    [queue],
  );

  const addToQueue = useCallback((album: AlbumItem) => {
    setQueue((current) => {
      if (
        current.some((item) => item.id === album.id) ||
        current.length >= QUEUE_LIMIT
      ) {
        return current;
      }

      return [...current, album];
    });
  }, []);

  const removeFromQueue = useCallback((albumId: string) => {
    setQueue((current) => current.filter((album) => album.id !== albumId));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const handleExport = useCallback(async () => {
    if (!spotifyBridge || queue.length === 0) {
      return;
    }

    setExporting(true);
    stop();

    try {
      await spotifyBridge.exportPlaylist(toSpotifyPlaylistPayload(queue));
    } finally {
      setExporting(false);
      start();
    }
  }, [queue, spotifyBridge, start, stop]);

  return (
    <div ref={chapterRef} className={styles.chapter}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CAP.05 / EPIC D</span>
          <h2>MIXTAPE LAB</h2>
        </div>
        <span className={styles.status}>
          {quotaExceeded
            ? "SPOTIFY QUOTA EXCEEDED"
            : rateLimitSeconds !== null
              ? "RATE LIMITED / RETRY IN " + rateLimitSeconds + "s"
              : "COLA LOCAL // " + queue.length + "/" + QUEUE_LIMIT}
        </span>
      </header>

      <div className={styles.lab}>
        <section className={styles.selector} aria-label="Discos disponibles">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>01 / SELECT</span>
              <h3>ARMA TU LADO A</h3>
            </div>
            <span className={styles.sectionHint}>TOCA + PARA SUMAR</span>
          </div>

          <div className={styles.albumGrid}>
            {loading ? (
              <div className={styles.emptyState}>CARGANDO DISCOS...</div>
            ) : pickedAlbums.length === 0 ? (
              <div className={styles.emptyState}>SIN MATERIAL</div>
            ) : (
              pickedAlbums.map((album) => {
                const alreadyQueued = queueIds.has(album.id);
                const disabled =
                  alreadyQueued || queue.length >= QUEUE_LIMIT;

                return (
                  <article className={styles.albumCard} key={album.id}>
                    <div className={styles.cover}>
                      {album.images[0]?.url && (
                        <Image
                          src={album.images[0].url}
                          alt=""
                          fill
                          sizes="110px"
                          unoptimized
                          className={styles.coverImage}
                        />
                      )}
                    </div>

                    <div className={styles.albumInfo}>
                      <strong>{album.name}</strong>
                      <span>{albumLabel(album)}</span>
                    </div>

                    <button
                      type="button"
                      className={styles.addButton}
                      aria-label={"Agregar " + album.name + " a la cola"}
                      disabled={disabled}
                      onClick={() => addToQueue(album)}
                    >
                      {alreadyQueued ? "OK" : "+"}
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className={styles.queue} aria-label="Cola local">
          <div className={styles.sectionHead}>
            <div>
              <span className={styles.sectionLabel}>02 / QUEUE</span>
              <h3>COLA LOCAL</h3>
            </div>
            <button
              type="button"
              className={styles.clearButton}
              disabled={queue.length === 0}
              onClick={clearQueue}
            >
              VACIAR
            </button>
          </div>

          <div className={styles.queueList}>
            {queue.length === 0 ? (
              <div className={styles.queueEmpty}>
                <span className={styles.queueEmptyMark}>+</span>
                <span>LA COLA ESTÁ VACÍA</span>
                <small>SUMÁ DISCOS DEL SELECTOR</small>
              </div>
            ) : (
              queue.map((album, index) => (
                <div className={styles.queueRow} key={album.id}>
                  <span className={styles.queueIndex}>
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className={styles.queueThumb}>
                    {album.images[0]?.url && (
                      <Image
                        src={album.images[0].url}
                        alt=""
                        fill
                        sizes="42px"
                        unoptimized
                        className={styles.coverImage}
                      />
                    )}
                  </div>

                  <div className={styles.queueMeta}>
                    <strong>{album.name}</strong>
                    <span>{albumLabel(album)}</span>
                  </div>

                  <button
                    type="button"
                    className={styles.removeButton}
                    aria-label={"Quitar " + album.name + " de la cola"}
                    onClick={() => removeFromQueue(album.id)}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>
          {queue.length === 0
            ? "READY / SELECT DISC"
            : String(queue.length) +
              " DISC" +
              (queue.length === 1 ? "" : "S") +
              " / LOCAL MEMORY"}
        </span>

        <button
          type="button"
          className={styles.spotifyButton}
          disabled={!spotifyBridge || queue.length === 0 || exporting}
          onClick={handleExport}
        >
          {exporting ? "EXPORTANDO..." : "EXPORTAR A SPOTIFY · POST-MVP"}
        </button>
      </footer>
    </div>
  );
}
