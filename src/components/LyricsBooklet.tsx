"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { useLyrics } from "@/hooks/useLyrics";
import { lastLyricsSpread, lyricsPageOffset, lyricsSpreadForOffset, paginateLyricsText } from "@/lib/lyricsPagination";
import styles from "./LyricsBooklet.module.css";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
  showTab?: boolean;
  active?: boolean;
}

type TurnDirection = "next" | "previous";
type PageTurn = { id: number; identity: string; source: string; direction: TurnDirection; from: number; to: number };

export function LyricsBooklet({ track, isOpen, onToggle, accentColor, showTab = true, active = true }: LyricsBookletProps) {
  const reading = useLyrics(track);
  const lyrics = reading.lyrics;
  const [pagination, setPagination] = useState<{ source: string | null; pages: string[]; measured: boolean }>({ source: null, pages: [], measured: false });
  const [currentPage, setCurrentPage] = useState(0);
  const [turn, setTurn] = useState<PageTurn | null>(null);
  const turnSequence = useRef(0);
  const spreadRef = useRef<HTMLDivElement>(null);
  const firstPageMeasureRef = useRef<HTMLDivElement>(null);
  const secondPageMeasureRef = useRef<HTMLDivElement>(null);
  const lineMeasureRef = useRef<HTMLDivElement>(null);
  const trackIdentity = track?.id || (track ? JSON.stringify([track.name, track.artists, track.album.name]) : "");
  const readingAnchor = useRef({ identity: trackIdentity, source: lyrics, offset: 0 });
  // A successful fetch is readable immediately, even before a hidden or zero
  // sized booklet can be measured. Pagination enhances this complete fallback.
  const measured = pagination.source === lyrics && pagination.measured;
  const pages = lyrics ? (pagination.source === lyrics && pagination.pages.length ? pagination.pages : [lyrics]) : [];
  const lastSpread = lastLyricsSpread(pages.length);
  const safePage = Math.min(Math.floor(currentPage / 2) * 2, lastSpread);
  const activeTurn = turn?.identity === trackIdentity && turn.source === lyrics && active && isOpen ? turn : null;
  useEffect(() => {
    readingAnchor.current = { identity: trackIdentity, source: null, offset: 0 };
    setCurrentPage(0);
    setTurn(null);
  }, [trackIdentity]);
  useEffect(() => setCurrentPage((page) => Math.min(Math.floor(page / 2) * 2, lastSpread)), [lastSpread]);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => { if (motion.matches) setTurn(null); };
    motion.addEventListener("change", stop);
    return () => motion.removeEventListener("change", stop);
  }, []);

  useLayoutEffect(() => {
    if (!lyrics) { setPagination({ source: null, pages: [], measured: false }); return; }
    if (!active || !isOpen) return;
    const spread = spreadRef.current;
    const firstPageMeasure = firstPageMeasureRef.current;
    const secondPageMeasure = secondPageMeasureRef.current;
    const lineMeasure = lineMeasureRef.current;
    if (!spread || !firstPageMeasure || !secondPageMeasure || !lineMeasure) return;
    let cancelled = false;
    let version = 0;
    let frame: number | null = null;
    const paginate = async () => {
      const currentVersion = ++version;
      await document.fonts?.ready;
      if (cancelled || currentVersion !== version) return;
      // Only the first page has a header. Other pages can fill the regular
      // text area, measured on the slightly shorter right sheet.
      const firstHeight = firstPageMeasure.clientHeight;
      const regularHeight = secondPageMeasure.clientHeight;
      const lineWidth = Math.min(firstPageMeasure.clientWidth, secondPageMeasure.clientWidth);
      if (firstHeight <= 0 || regularHeight <= 0 || lineWidth <= 0) return;
      lineMeasure.style.width = `${lineWidth}px`;
      const line = document.createElement("div");
      lineMeasure.replaceChildren(line);
      const measure = (text: string) => { line.textContent = text || "\u00a0"; return line.offsetHeight; };
      measure("AgjpQ");
      const inkOverflow = Math.max(0, line.scrollHeight - line.clientHeight);
      const next = paginateLyricsText(lyrics, firstHeight - inkOverflow, regularHeight - inkOverflow, measure);
      const canPaginate = next.length > 1 || measure(lyrics) + inkOverflow <= firstHeight;
      if (cancelled || currentVersion !== version) return;
      const anchor = readingAnchor.current;
      const offset = anchor.identity === trackIdentity && anchor.source === lyrics ? anchor.offset : 0;
      setTurn(null);
      setPagination((previous) => previous.source === lyrics && previous.measured === canPaginate && previous.pages.length === next.length && previous.pages.every((page, index) => page === next[index]) ? previous : { source: lyrics, pages: next, measured: canPaginate });
      setCurrentPage(lyricsSpreadForOffset(next, offset));
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
    observer.observe(secondPageMeasure);
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
  const navigate = (direction: TurnDirection) => {
    if (!active || !isOpen || reading.loading || !measured || !lyrics) return;
    const target = Math.max(0, Math.min(lastSpread, safePage + (direction === "next" ? 2 : -2)));
    if (target === safePage) return;
    readingAnchor.current = { identity: trackIdentity, source: lyrics, offset: lyricsPageOffset(pages, target) };
    // The reading state changes now. Animation only depicts the sheet and may
    // be interrupted; its completion can never select a page or a track.
    setCurrentPage(target);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTurn(null); return; }
    setTurn({ id: ++turnSequence.current, identity: trackIdentity, source: lyrics, direction, from: safePage, to: target });
  };
  const previous = () => navigate("previous");
  const next = () => navigate("next");
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || !isOpen || event.defaultPrevented || (event.target as Element).closest("input, textarea, select, [contenteditable=true]")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); event.stopPropagation(); previous(); }
    if (event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); next(); }
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onToggle(); }
  };
  const coverUrl = track.album.images[0]?.url;
  const artist = track.artists.map((item) => item.name).join(", ");
  const status = reading.loading ? "loading" : reading.status;
  const statusText = reading.loading ? "CARGANDO LETRA…" : reading.status === "instrumental" ? "PISTA INSTRUMENTAL · INDICADA POR EL PROVEEDOR" : reading.status === "unavailable" ? "LETRA NO DISPONIBLE PARA ESTA PISTA" : reading.status === "error" ? reading.error : null;
  const pageHeader = (decorative = false) => (
    <div className={styles.bookletHeader}>
      {decorative ? <div className={styles.turnTitle}>{track.name}</div> : <h4 title={track.name}>{track.name}</h4>}
      <span title={artist}>{artist}</span>
    </div>
  );
  const pageNumber = (left: boolean, index: number) => index < pages.length && (
    <span className={left ? styles.bookletPageNumberLeft : styles.bookletPageNumberRight} aria-hidden="true">
      {String(index + 1).padStart(2, "0")}
    </span>
  );
  const provenance = reading.provenance.provider === "demo" && <span className={styles.lyricsProvenance}>DEMO · LETRA FICTICIA</span>;
  const leafFace = (left: boolean, index: number, stationary = false) => (
    <div className={`${styles.bookletContent} ${stationary ? styles.stationaryPageCopy : ""}`} aria-hidden="true">
      {index === 0 && pageHeader(true)}
      <div className={styles.turnText}>{pages[index] ?? ""}</div>
      {!left && provenance}
      {pageNumber(left, index)}
    </div>
  );
  const turnNext = activeTurn?.direction === "next";
  const turnPrevious = activeTurn?.direction === "previous";
  const canTurn = active && isOpen && measured && !reading.loading;
  return <div className={`${styles.bookletOuter} ${isOpen ? styles.isOpen : ""}`} style={{ "--booklet-accent": accentColor } as CSSProperties}
    data-testid="lyrics-booklet" data-track-id={track.id} data-status={status} data-pagination-index={safePage} data-pagination-count={pages.length} data-pagination-state={measured ? "ready" : "fallback"} data-page-turn-state={activeTurn ? activeTurn.direction : "idle"} data-reading-anchor={readingAnchor.current.offset}>
    {showTab && <button type="button" className={styles.bookletTab} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onToggle(); }} aria-label={isOpen ? "Cerrar booklet de letras" : "Abrir booklet de letras"}>
      {coverUrl ? <Image src={coverUrl} alt="" width={104} height={78} unoptimized className={styles.bookletCover} /> : <span className={styles.bookletIcon} aria-hidden="true">▣</span>}
      <span className={styles.bookletTabLabel} aria-hidden="true">{track.album.name}</span><span className={styles.bookletTabHint} aria-hidden="true">LYRICS</span>
    </button>}
    <div className={styles.bookletRegion} role="region" aria-label="Booklet de letras" tabIndex={active && isOpen ? 0 : -1} inert={!active || !isOpen} aria-busy={reading.loading} onKeyDown={handleKey}>
      <div ref={spreadRef} className={styles.bookletPageSpread} data-testid="lyrics-paper">
        <div className={styles.bookletPageStack} /><div className={styles.bookletCenterSpine} />
        <div className={`${styles.bookletPageHalf} ${styles.bookletPageLeft}`} data-booklet-page-half="left">
          <div className={styles.bookletContent} data-turn-receiving={turnNext || undefined}>
            {safePage === 0 && pageHeader()}
            {statusText ? <div className={styles.bookletStatus} data-testid="lyrics-status" role={reading.status === "error" ? "alert" : "status"}>{statusText}
              {reading.status === "error" && <button type="button" disabled={reading.retryBlocked} onClick={reading.retry}>REINTENTAR</button>}
            </div> : <div className={`${styles.bookletLyrics} ${!measured ? styles.lyricsFallback : ""}`} data-testid="lyrics-content" data-page-index={safePage}>{pages[safePage] ?? ""}</div>}
            {pageNumber(true, safePage)}
          </div>
          {turnNext && leafFace(true, activeTurn.from, true)}
          <button type="button" className={`${styles.bookletEdgeButton} ${styles.bookletEdgePrevious}`} data-booklet-edge="previous"
            aria-label="Páginas anteriores" disabled={!canTurn || !hasPrevious} onClick={previous} />
        </div>
        <div className={`${styles.bookletPageHalf} ${styles.bookletPageRight}`} data-booklet-page-half="right">
          <div className={styles.bookletContent} data-turn-receiving={turnPrevious || undefined}>
            <div className={styles.bookletLyrics} data-testid="lyrics-content" data-page-index={safePage + 1}>{pages[safePage + 1] ?? ""}</div>
            {provenance}
            {pageNumber(false, safePage + 1)}
          </div>
          {turnPrevious && leafFace(false, activeTurn.from + 1, true)}
          <button type="button" className={`${styles.bookletEdgeButton} ${styles.bookletEdgeNext}`} data-booklet-edge="next"
            aria-label="Páginas siguientes" disabled={!canTurn || !hasNext} onClick={next} />
        </div>
        {activeTurn && <div key={activeTurn.id} className={`${styles.turningLeaf} ${activeTurn.direction === "next" ? styles.turningNext : styles.turningPrevious}`} data-testid="lyrics-turning-leaf" aria-hidden="true" onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setTurn((current) => current?.id === activeTurn.id ? null : current);
        }}>
          <div className={`${styles.bookletPageHalf} ${turnNext ? styles.bookletPageRight : styles.bookletPageLeft} ${styles.turnFront}`} data-turn-face="front">
            {leafFace(!turnNext, activeTurn.from + (turnNext ? 1 : 0))}
          </div>
          <div className={`${styles.bookletPageHalf} ${turnNext ? styles.bookletPageLeft : styles.bookletPageRight} ${styles.turnBack}`} data-turn-face="back">
            {leafFace(turnNext, activeTurn.to + (turnNext ? 0 : 1))}
          </div>
        </div>}
        <div className={styles.bookletPaginationMeasure} aria-hidden="true"><div className={styles.bookletMeasurePage}><div className={styles.bookletMeasureContent}>
          {pageHeader()}<div ref={firstPageMeasureRef} className={styles.bookletMeasureLyrics} />
        </div></div><div className={`${styles.bookletMeasurePage} ${styles.bookletMeasurePageRight}`}><div className={styles.bookletMeasureContent}><div ref={secondPageMeasureRef} className={styles.bookletMeasureLyrics} /></div></div><div ref={lineMeasureRef} className={styles.bookletLineMeasureSource} /></div>
      </div>
      <span className={styles.pageAnnouncement} role="status" aria-live="polite" data-testid="lyrics-page-status">
        {pages.length > 0 ? `Página ${Math.floor(safePage / 2) + 1} de ${Math.ceil(pages.length / 2)}` : null}
      </span>
    </div>
  </div>;
}
