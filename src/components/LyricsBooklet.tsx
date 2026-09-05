"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type KeyboardEvent,
} from "react";

import type { SpotifyTrack } from "@/types/spotify";
import styles from "./LyricsBooklet.module.css";

interface LyricsBookletProps {
  track: SpotifyTrack | null;
  isOpen: boolean;
  onToggle: () => void;
  accentColor: string;
}

export function LyricsBooklet({
  track,
  isOpen,
  onToggle,
  accentColor,
}: LyricsBookletProps) {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const firstPageMeasureRef = useRef<HTMLDivElement>(null);
  const regularPageMeasureRef = useRef<HTMLDivElement>(null);
  const lineMeasureRef = useRef<HTMLDivElement>(null);

  const style = {
    "--booklet-accent": accentColor,
  } as CSSProperties;

  /*
   * =========================================================
   * FETCH LYRICS
   * =========================================================
   */

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      setPages([]);
      setCurrentPage(0);
      return;
    }

    const fetchLyrics = async () => {
      setLoading(true);
      setLyrics(null);
      setPages([]);
      setCurrentPage(0);

      try {
        const artist = track.artists[0]?.name || "";
        const title = track.name || "";
        const album = track.album?.name || "";
        const duration = Math.round((track.duration_ms || 0) / 1000);

        const res = await fetch(
          `/api/lyrics?artist=${encodeURIComponent(
            artist,
          )}&title=${encodeURIComponent(title)}&album=${encodeURIComponent(
            album,
          )}&duration=${duration}`,
        );

        const data = await res.json();

        setLyrics(data.lyrics || "Pista instrumental / Letra no encontrada.");
      } catch {
        setLyrics("Error de lectura del archivo.");
      } finally {
        setLoading(false);
      }
    };

    fetchLyrics();
  }, [track?.id]);

  /*
   * =========================================================
   * REAL DOM-BASED PAGINATION
   * =========================================================
   *
   * The browser measures each source line using the actual
   * booklet typography and width.
   *
   * This avoids arbitrary character/weight limits.
   */

  useLayoutEffect(() => {
    if (!lyrics || !track) {
      setPages([]);
      return;
    }

    const firstPageMeasure = firstPageMeasureRef.current;

    const regularPageMeasure = regularPageMeasureRef.current;

    const lineMeasure = lineMeasureRef.current;

    if (!firstPageMeasure || !regularPageMeasure || !lineMeasure) {
      return;
    }

    const paginate = () => {
      const firstPageRect = firstPageMeasure.getBoundingClientRect();

      const regularPageRect = regularPageMeasure.getBoundingClientRect();

      const regularPageTop = regularPageRect.top;

      const regularPageBottom = regularPageRect.bottom;

      const measuredRegularHeight = regularPageBottom - regularPageTop;

      const firstPageTop = firstPageRect.top;

      const firstPageBottom = firstPageRect.bottom;

      const measuredFirstHeight = firstPageBottom - firstPageTop;

      const lineWidth = lineMeasure.clientWidth;

      const firstPageHeight = measuredFirstHeight;

      const regularPageHeight = measuredRegularHeight;

      if (firstPageHeight <= 0 || regularPageHeight <= 0 || lineWidth <= 0) {
        return;
      }

      /*
       * Normalize Windows line endings without altering
       * the actual content structure.
       */
      const normalizedLyrics = lyrics
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const lines = normalizedLyrics.split("\n");

      /*
       * -----------------------------------------------------
       * Measure every source line using the real typography.
       * -----------------------------------------------------
       */

      lineMeasure.replaceChildren();

      const lineElements = lines.map((line) => {
        const element = document.createElement("div");

        /*
         * A blank source line still needs a real line box.
         */
        element.textContent = line === "" ? "\u00A0" : line;

        if (line === "") {
          element.style.height = "8px";
          element.style.minHeight = "8px";
        }
        lineMeasure.appendChild(element);

        return element;
      });

      const lineHeights = lineElements.map(
        (element) => element.getBoundingClientRect().height,
      );

      /*
       * Safety fallback in case the browser returns a
       * zero-height measurement.
       */
      const fallbackLineHeight = 15 * 1.18;

      const heights = lineHeights.map((height) =>
        height > 0 ? height : fallbackLineHeight,
      );

      /*
       * -----------------------------------------------------
       * Build semantic lyric blocks.
       *
       * A block is a verse/stanza separated by blank lines.
       * We prefer keeping complete blocks together.
       * If a block is taller than a page, it is split safely
       * line by line.
       * -----------------------------------------------------
       */

      interface LyricBlock {
        lines: string[];
        heights: number[];
      }

      const blocks: LyricBlock[] = [];

      let currentBlockLines: string[] = [];
      let currentBlockHeights: number[] = [];

      lines.forEach((line, index) => {
        const height = heights[index];

        if (line.trim() === "") {
          if (currentBlockLines.length > 0) {
            blocks.push({
              lines: [...currentBlockLines, ""],
              heights: [...currentBlockHeights, height],
            });

            currentBlockLines = [];
            currentBlockHeights = [];
          } else {
            /*
             * Preserve consecutive blank lines as their
             * own block instead of silently deleting them.
             */
            blocks.push({
              lines: [""],
              heights: [height],
            });
          }

          return;
        }

        currentBlockLines.push(line);
        currentBlockHeights.push(height);
      });

      if (currentBlockLines.length > 0) {
        blocks.push({
          lines: currentBlockLines,
          heights: currentBlockHeights,
        });
      }

      /*
       * If the lyric source somehow contains no blocks,
       * keep the original content intact.
       */
      if (blocks.length === 0) {
        setPages([lyrics]);
        return;
      }

      /*
       * -----------------------------------------------------
       * Page builder.
       * -----------------------------------------------------
       */

      const result: string[] = [];

      let currentLines: string[] = [];
      let currentHeight = 0;

      /*
       * First physical page is shorter because it contains
       * the track title + artist header.
       */
      let availableHeight = firstPageHeight;

      const pushCurrentPage = () => {
        if (currentLines.length === 0) return;

        result.push(currentLines.join("\n"));

        currentLines = [];
        currentHeight = 0;

        /*
         * Every page after page 1 uses the same baseline.
         */
        availableHeight = regularPageHeight;
      };

      /*
       * Add lines while respecting the actual measured
       * available height.
       */
      const addLine = (line: string, height: number) => {
        /*
         * A single source line can be taller than the page
         * because of wrapping. It still must be preserved.
         */
        if (currentLines.length === 0 && height > availableHeight) {
          currentLines.push(line);
          currentHeight += height;
          pushCurrentPage();
          return;
        }

        if (currentHeight + height <= availableHeight) {
          currentLines.push(line);
          currentHeight += height;
          return;
        }

        /*
         * The line doesn't fit.
         * Move it to the next page rather than hiding it.
         */
        pushCurrentPage();

        currentLines.push(line);
        currentHeight += height;
      };

      blocks.forEach((block) => {
        const blockHeight = block.heights.reduce(
          (sum, height) => sum + height,
          0,
        );

        /*
         * If the entire verse/stanza fits, keep it together.
         */
        if (
          currentLines.length > 0 &&
          blockHeight <= availableHeight - currentHeight
        ) {
          block.lines.forEach((line, index) => {
            addLine(line, block.heights[index]);
          });

          return;
        }

        /*
         * If the block itself fits on an empty page,
         * start it there instead of splitting it.
         */
        if (currentLines.length === 0 && blockHeight <= availableHeight) {
          block.lines.forEach((line, index) => {
            addLine(line, block.heights[index]);
          });

          return;
        }

        /*
         * The block does not fit as a whole.
         *
         * If the current page already contains a reasonable
         * amount of content, start the verse on the next page.
         * This keeps the editorial rhythm cleaner.
         */
        /*
         * Now fill the remaining/current page line by line.
         * This is the safe fallback for long verses.
         */
        block.lines.forEach((line, index) => {
          addLine(line, block.heights[index]);
        });
      });

      pushCurrentPage();

      /*
       * Absolute safety:
       * if something went wrong during measurement, never
       * silently lose the source lyrics.
       */
      const reconstructed = result.join("\n");

      const sourceComparable = normalizedLyrics.trim();

      const resultComparable = reconstructed.trim();

      if (
        sourceComparable.length > 0 &&
        !resultComparable.includes(
          sourceComparable.slice(0, Math.min(32, sourceComparable.length)),
        )
      ) {
        setPages([lyrics]);
        return;
      }

      setPages(result.length > 0 ? result : [lyrics]);
    };

    /*
     * Run once after layout.
     */
    paginate();

    /*
     * Recalculate if the booklet changes size.
     */
    const resizeObserver = new ResizeObserver(() => {
      paginate();
    });

    resizeObserver.observe(firstPageMeasure);
    resizeObserver.observe(regularPageMeasure);

    return () => {
      resizeObserver.disconnect();
    };
  }, [lyrics, track]);

  /*
   * =========================================================
   * KEEP CURRENT PAGE VALID
   * =========================================================
   */

  useEffect(() => {
    if (pages.length === 0) {
      setCurrentPage(0);
      return;
    }

    const lastValidPage = Math.max(0, pages.length - 2);

    setCurrentPage((page) => Math.min(page, lastValidPage));
  }, [pages.length]);

  /*
   * =========================================================
   * KEYBOARD NAVIGATION
   * =========================================================
   */

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyboardNavigation = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();

        setCurrentPage((page) => Math.max(0, page - 2));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();

        setCurrentPage((page) =>
          Math.min(Math.max(0, pages.length - 2), page + 2),
        );
      }

      if (event.key === "Escape") {
        event.preventDefault();

        onToggle();
      }
    };

    window.addEventListener("keydown", handleKeyboardNavigation);

    return () => {
      window.removeEventListener("keydown", handleKeyboardNavigation);
    };
  }, [isOpen, onToggle, pages.length]);

  if (!track) return null;

  /*
   * =========================================================
   * PAGE STATE
   * =========================================================
   */

  const leftPageIdx = currentPage;
  const rightPageIdx = currentPage + 1;

  const hasPreviousPage = currentPage > 0;

  const hasNextPage = rightPageIdx < pages.length - 1;

  const leftPageNumber = leftPageIdx + 1;

  const rightPageNumber = rightPageIdx < pages.length ? rightPageIdx + 1 : null;

  const coverUrl = track.album.images[0]?.url;

  /*
   * =========================================================
   * INTERACTION
   * =========================================================
   */

  const handleToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    onToggle();
  };

  const goPrevious = () => {
    if (!hasPreviousPage) return;

    setCurrentPage((page) => Math.max(0, page - 2));
  };

  const goNext = () => {
    if (!hasNextPage) return;

    setCurrentPage((page) => Math.min(Math.max(0, pages.length - 2), page + 2));
  };

  const handlePageClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!isOpen || loading) return;

    const bounds = event.currentTarget.getBoundingClientRect();

    const clickX = event.clientX - bounds.left;

    if (clickX < bounds.width / 2) {
      goPrevious();
    } else {
      goNext();
    }
  };

  const handlePageKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
  };

  return (
    <div
      className={`${styles.bookletOuter} ${isOpen ? styles.isOpen : ""}`}
      style={style}
    >
      {/* =====================================================
          CLOSED / PHYSICAL COVER
          ===================================================== */}

      <button
        type="button"
        onClick={handleToggle}
        className={styles.bookletTab}
        aria-label={
          isOpen ? "Cerrar booklet de letras" : "Abrir booklet de letras"
        }
      >
        {coverUrl ? (
          <img src={coverUrl} alt="" className={styles.bookletCover} />
        ) : (
          <span className={styles.bookletIcon} aria-hidden="true">
            ▣
          </span>
        )}

        <span className={styles.bookletTabLabel} aria-hidden="true">
          {track.album.name}
        </span>

        <span className={styles.bookletTabHint} aria-hidden="true">
          LYRICS
        </span>
      </button>

      {/* =====================================================
          BOOK
          ===================================================== */}

      <div
        className={styles.bookletPageSpread}
        onClick={handlePageClick}
        onKeyDown={handlePageKeyDown}
        role="region"
        tabIndex={isOpen ? 0 : -1}
        aria-label="Booklet de letras"
      >
        <div className={styles.bookletPageStack} />

        <div className={styles.bookletCenterSpine} />

        {/* =================================================
            LEFT PAGE
            ================================================= */}

        <div className={`${styles.bookletPageHalf} ${styles.bookletPageLeft}`}>
          <div className={styles.bookletContent}>
            {leftPageIdx === 0 ? (
              <div className={styles.bookletHeader}>
                <h4>{track.name}</h4>

                <span>
                  {track.artists.map((artist) => artist.name).join(", ")}
                </span>
              </div>
            ) : null}

            <div className={styles.bookletLyrics}>
              {loading ? "[ CARGANDO... ]" : pages[leftPageIdx] || ""}
            </div>
          </div>
        </div>

        {/* =================================================
            RIGHT PAGE
            ================================================= */}

        <div className={`${styles.bookletPageHalf} ${styles.bookletPageRight}`}>
          <div className={styles.bookletContent}>
            <div className={styles.bookletLyrics}>
              {loading ? "" : pages[rightPageIdx] || ""}
            </div>
          </div>
        </div>

        {/* =================================================
            PAGE NUMBERS
            ================================================= */}

        {!loading && pages.length > 0 && (
          <>
            <span className={styles.bookletPageNumberLeft} aria-hidden="true">
              {String(leftPageNumber).padStart(2, "0")}
            </span>

            {rightPageNumber !== null && (
              <span
                className={styles.bookletPageNumberRight}
                aria-hidden="true"
              >
                {String(rightPageNumber).padStart(2, "0")}
              </span>
            )}
          </>
        )}

        {/* =================================================
            EDGE NAVIGATION
            ================================================= */}

        {hasPreviousPage && (
          <button
            type="button"
            className={`${styles.bookletEdgeButton} ${styles.bookletEdgePrevious}`}
            onClick={(event) => {
              event.stopPropagation();
              goPrevious();
            }}
            aria-label="Páginas anteriores"
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}

        {hasNextPage && (
          <button
            type="button"
            className={`${styles.bookletEdgeButton} ${styles.bookletEdgeNext}`}
            onClick={(event) => {
              event.stopPropagation();
              goNext();
            }}
            aria-label="Páginas siguientes"
          >
            <span aria-hidden="true">›</span>
          </button>
        )}

        <div className={styles.bookletNavigationHint} aria-hidden="true">
          <span>‹</span>
          <span>›</span>
        </div>

        {/* =================================================
            HIDDEN MEASUREMENT SYSTEM
            ================================================= */}

        <div className={styles.bookletPaginationMeasure} aria-hidden="true">
          <div className={styles.bookletMeasurePage}>
            <div className={styles.bookletMeasureContent}>
              <div className={styles.bookletHeader}>
                <h4>{track.name}</h4>

                <span>
                  {track.artists.map((artist) => artist.name).join(", ")}
                </span>
              </div>

              <div
                ref={firstPageMeasureRef}
                className={styles.bookletMeasureLyrics}
              />
            </div>
          </div>

          <div className={styles.bookletMeasurePage}>
            <div className={styles.bookletMeasureContent}>
              <div
                ref={regularPageMeasureRef}
                className={styles.bookletMeasureLyrics}
              />
            </div>
          </div>

          <div
            ref={lineMeasureRef}
            className={styles.bookletLineMeasureSource}
          />
        </div>
      </div>
    </div>
  );
}
