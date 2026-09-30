"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRail } from "@/components/scroll/RailContext";
import { JewelCaseDetailModal } from "./JewelCaseDetailModal";
import { RailFlyingDisc } from "./RailFlyingDisc";
import { CrateShelf } from "./CrateShelf";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateChapter.module.css";

const SHELF_COUNT = 18;

export function CrateChapter() {
  const { stop, start } = useRail();
  const [albums, setAlbums] = useState<AlbumItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number | null>(null);
  const [isNearChapter, setIsNearChapter] = useState(false);
  const [selected, setSelected] = useState<AlbumItem | null>(null);
  const [flight, setFlight] = useState<{
    album: AlbumItem;
    originRect: DOMRect;
  } | null>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const chapter = chapterRef.current;
    const wrapper = chapter?.closest<HTMLElement>('[aria-label="Horizontal rail"]');

    if (!chapter || !wrapper) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNearChapter(
          entry.isIntersecting && entry.intersectionRatio >= 0.55,
        );
      },
      { root: wrapper, threshold: [0, 0.55, 1] },
    );

    observer.observe(chapter);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isNearChapter) return;

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
          setAlbums(data);
          setRateLimitSeconds(null);
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
  }, [isNearChapter]);

  const handleGrabStart = useCallback(() => {
    stop();
  }, [stop]);

  const handleGrabEnd = useCallback(() => {
    start();
  }, [start]);

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

  const statusLabel =
    rateLimitSeconds !== null
      ? "RATE LIMITED / RETRY IN " + rateLimitSeconds + "s"
      : loading
        ? "INDEXANDO..."
        : albums.length + " DISCS";

  return (
    <div ref={chapterRef} className={styles.chapter}>
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>CAP.03 / EPIC C</span>
          <h2>LA BATEA</h2>
        </div>
        <span className={styles.status}>{statusLabel}</span>
      </header>

      <div className={styles.shelfArea}>
        {loading ? (
          <div className={styles.emptyState}>CARGANDO ARCHIVO...</div>
        ) : albums.length === 0 ? (
          <div className={styles.emptyState}>ARCHIVO VACÍO</div>
        ) : (
          <CrateShelf
            albums={albums.slice(0, SHELF_COUNT)}
            onSelect={handleSelect}
            onGrabStart={handleGrabStart}
            onGrabEnd={handleGrabEnd}
          />
        )}
      </div>

      {selected && (
        <JewelCaseDetailModal
          album={selected}
          onClose={() => setSelected(null)}
          onLoad={() => setSelected(null)}
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
