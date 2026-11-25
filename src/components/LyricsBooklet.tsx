"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { useLyrics } from "@/hooks/useLyrics";
import { lastLyricsSpread, paginateLyricsText } from "@/lib/lyricsPagination";
import styles from "./LyricsBooklet.module.css";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
  showTab?: boolean;
  active?: boolean;
}

export function LyricsBooklet({ track, isOpen, onToggle, accentColor, showTab = true, active = true }: LyricsBookletProps) {
  const reading = useLyrics(track);
  const lyrics = reading.lyrics;
  const [pagination, setPagination] = useState<{ source: string | null; pages: string[]; measured: boolean }>({ source: null, pages: [], measured: false });
  const [currentPage, setCurrentPage] = useState(0);
  const spreadRef = useRef<HTMLDivElement>(null);
  const firstPageMeasureRef = useRef<HTMLDivElement>(null);
  const secondPageMeasureRef = useRef<HTMLDivElement>(null);
  const firstHeaderMeasureRef = useRef<HTMLDivElement>(null);
  const lineMeasureRef = useRef<HTMLDivElement>(null);
  const trackIdentity = track?.id || (track ? JSON.stringify([track.name, track.artists, track.album.name]) : "");
  // A successful fetch is readable immediately, even before a hidden or zero
  // sized booklet can be measured. Pagination enhances this complete fallback.
  const measured = pagination.source === lyrics && pagination.measured;
  const pages = lyrics ? (pagination.source === lyrics && pagination.pages.length ? pagination.pages : [lyrics]) : [];
  const lastSpread = lastLyricsSpread(pages.length);
  const safePage = Math.min(Math.floor(currentPage / 2) * 2, lastSpread);
  useEffect(() => setCurrentPage(0), [trackIdentity]);
  useEffect(() => setCurrentPage((page) => Math.min(Math.floor(page / 2) * 2, lastSpread)), [lastSpread]);

  useLayoutEffect(() => {
    if (!lyrics) { setPagination({ source: null, pages: [], measured: false }); return; }
    if (!active || !isOpen) return;
    const spread = spreadRef.current;
    const firstPageMeasure = firstPageMeasureRef.current;
    const secondPageMeasure = secondPageMeasureRef.current;
    const header = firstHeaderMeasureRef.current;
    const lineMeasure = lineMeasureRef.current;
    if (!spread || !firstPageMeasure || !secondPageMeasure || !header || !lineMeasure) return;
    let cancelled = false;
    let version = 0;
    let frame: number | null = null;
    const paginate = async () => {
      const currentVersion = ++version;
      // Until fonts settle, the full text fallback remains scrollable.
      await document.fonts?.ready;
      if (cancelled || currentVersion !== version) return;
      const content = firstPageMeasure.parentElement;
      if (!content) return;
      const contentStyle = getComputedStyle(content);
      const padding = (parseFloat(contentStyle.paddingTop) || 0) + (parseFloat(contentStyle.paddingBottom) || 0);
      const regularHeight = spread.clientHeight - padding;
      // Layout metrics are deliberately untransformed. Mixing a transformed
      // bounding box with offsetHeight can erase the whole first text area.
      const firstHeight = regularHeight - header.offsetHeight - (parseFloat(getComputedStyle(header).marginBottom) || 0);
      const lineWidth = Math.min(firstPageMeasure.clientWidth, secondPageMeasure.clientWidth);
      if (firstHeight <= 0 || regularHeight <= 0 || lineWidth <= 0) return;
      // The physical faces are 54% and 52% wide. A shared source must fit the
      // narrower right face, rather than silently clipping its wrapped lines.
      lineMeasure.style.width = `${lineWidth}px`;
      const line = document.createElement("div");
      lineMeasure.replaceChildren(line);
      const measure = (text: string) => { line.textContent = text || "\u00a0"; return line.offsetHeight; };
      measure("AgjpQ");
      const inkOverflow = Math.max(0, line.scrollHeight - line.clientHeight);
      const next = paginateLyricsText(lyrics, firstHeight - inkOverflow, regularHeight - inkOverflow, measure);
      const canPaginate = next.length > 1 || measure(lyrics) + inkOverflow <= firstHeight;
      if (!cancelled && currentVersion === version) setPagination((previous) => previous.source === lyrics && previous.measured === canPaginate && previous.pages.length === next.length && previous.pages.every((page, index) => page === next[index]) ? previous : { source: lyrics, pages: next, measured: canPaginate });
    };
    const schedule = () => {
      version++;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; void paginate(); });
    };
    void paginate();
    const observer = new ResizeObserver(schedule);
    observer.observe(spread);
    observer.observe(firstPageMeasure);
    window.addEventListener("resize", schedule);
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => {
      cancelled = true; version++;
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [lyrics, trackIdentity, isOpen, active]);

  if (!track) return null;
  const hasPrevious = safePage > 0;
  const hasNext = safePage < lastSpread;
  const previous = () => { if (active && hasPrevious) setCurrentPage((page) => Math.max(0, page - 2)); };
  const next = () => { if (active && hasNext) setCurrentPage((page) => Math.min(lastSpread, page + 2)); };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || !isOpen || event.defaultPrevented || (event.target as Element).closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); previous(); }
    if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); next(); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onToggle(); }
  };
  const coverUrl = track.album.images[0]?.url;
  const status = reading.loading ? "loading" : reading.status;
  const statusText = reading.loading ? "CARGANDO LETRA…" : reading.status === "instrumental" ? "PISTA INSTRUMENTAL · INDICADA POR EL PROVEEDOR" : reading.status === "unavailable" ? "LETRA NO DISPONIBLE PARA ESTA PISTA" : reading.status === "error" ? reading.error : null;
  return <div className={`${styles.bookletOuter} ${isOpen ? styles.isOpen : ""}`} style={{ "--booklet-accent": accentColor } as CSSProperties}
    data-testid="lyrics-booklet" data-track-id={track.id} data-status={status} data-pagination-index={safePage} data-pagination-count={pages.length} data-pagination-state={measured ? "ready" : "fallback"}>
    {showTab && <button type="button" className={styles.bookletTab} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }} aria-label={isOpen ? "Cerrar booklet de letras" : "Abrir booklet de letras"}>
      {coverUrl ? <Image src={coverUrl} alt="" width={104} height={78} unoptimized className={styles.bookletCover} /> : <span className={styles.bookletIcon} aria-hidden="true">▣</span>}
      <span className={styles.bookletTabLabel} aria-hidden="true">{track.album.name}</span><span className={styles.bookletTabHint} aria-hidden="true">LYRICS</span>
    </button>}
    <div ref={spreadRef} className={styles.bookletPageSpread} role="region" aria-label="Booklet de letras" tabIndex={active && isOpen ? 0 : -1} aria-busy={reading.loading}
      onKeyDown={handleKey} onClick={(event) => {
        if (!active || !isOpen || reading.loading || !measured || (event.target as Element).closest("button, a")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX - bounds.left < bounds.width / 2) previous(); else next();
      }}>
      <div className={styles.bookletPageStack} /><div className={styles.bookletCenterSpine} />
      <div className={`${styles.bookletPageHalf} ${styles.bookletPageLeft}`}><div className={styles.bookletContent}>
        {safePage === 0 && <div className={styles.bookletHeader}><h4>{track.name}</h4><span>{track.artists.map((artist) => artist.name).join(", ")}</span></div>}
        {statusText ? <div className={styles.bookletStatus} data-testid="lyrics-status" role={reading.status === "error" ? "alert" : "status"}>{statusText}
          {reading.status === "error" && <button type="button" disabled={reading.retryBlocked} onClick={(event) => { event.stopPropagation(); reading.retry(); }}>REINTENTAR</button>}
        </div> : <div className={`${styles.bookletLyrics} ${!measured ? styles.lyricsFallback : ""}`} data-testid="lyrics-content" data-page-index={safePage}>{pages[safePage] ?? ""}</div>}
      </div></div>
      <div className={`${styles.bookletPageHalf} ${styles.bookletPageRight}`}><div className={styles.bookletContent}>
        <div className={styles.bookletLyrics} data-testid="lyrics-content" data-page-index={safePage + 1}>{pages[safePage + 1] ?? ""}</div>
        {reading.provenance.provider === "demo" && <span className={styles.lyricsProvenance}>DEMO · LETRA FICTICIA</span>}
      </div></div>
      {pages.length > 0 && <><span className={styles.bookletPageNumberLeft} aria-hidden="true">{String(safePage + 1).padStart(2, "0")}</span>{safePage + 1 < pages.length && <span className={styles.bookletPageNumberRight} aria-hidden="true">{String(safePage + 2).padStart(2, "0")}</span>}</>}
      {hasPrevious && <button type="button" className={`${styles.bookletEdgeButton} ${styles.bookletEdgePrevious}`} onClick={(event) => { event.stopPropagation(); previous(); }} aria-label="Páginas anteriores"><span aria-hidden="true">‹</span></button>}
      {hasNext && <button type="button" className={`${styles.bookletEdgeButton} ${styles.bookletEdgeNext}`} onClick={(event) => { event.stopPropagation(); next(); }} aria-label="Páginas siguientes"><span aria-hidden="true">›</span></button>}
      <div className={styles.bookletNavigationHint} aria-hidden="true"><span>‹</span><span>›</span></div>
      <div className={styles.bookletPaginationMeasure} aria-hidden="true"><div className={styles.bookletMeasurePage}><div className={styles.bookletMeasureContent}>
        <div ref={firstHeaderMeasureRef} className={styles.bookletHeader}><h4>{track.name}</h4><span>{track.artists.map((artist) => artist.name).join(", ")}</span></div><div ref={firstPageMeasureRef} className={styles.bookletMeasureLyrics} />
      </div></div><div className={styles.bookletMeasurePage}><div className={styles.bookletMeasureContent}><div ref={secondPageMeasureRef} className={styles.bookletMeasureLyrics} /></div></div><div ref={lineMeasureRef} className={styles.bookletLineMeasureSource} /></div>
    </div>
  </div>;
}
