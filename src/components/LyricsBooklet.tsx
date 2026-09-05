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

  const spreadRef = useRef<HTMLDivElement>(null);
  const firstPageMeasureRef = useRef<HTMLDivElement>(null);
  const firstHeaderMeasureRef = useRef<HTMLDivElement>(null);
  const lineMeasureRef = useRef<HTMLDivElement>(null);

  const style = {
    "--booklet-accent": accentColor,
  } as CSSProperties;

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

  useLayoutEffect(() => {
    if (!lyrics || !track) {
      setPages([]);
      return;
    }

    const spread = spreadRef.current;
    const firstPageMeasure = firstPageMeasureRef.current;
    const firstHeaderMeasure = firstHeaderMeasureRef.current;
    const lineMeasure = lineMeasureRef.current;

    if (!spread || !firstPageMeasure || !firstHeaderMeasure || !lineMeasure) {
      return;
    }

    const paginate = () => {
      /*
       * IMPORTANT:
       * Measure the physical page itself, not the synthetic flex
       * content wrapper. The wrapper can resolve to a smaller
       * intrinsic height and was the reason pagination was stopping
       * well before the real bottom of the paper.
       *
       * offsetHeight is intentionally used here because it gives us
       * the layout height before the booklet's visual transform/scale.
       */
      const physicalPageHeight = spread.offsetHeight;

      const firstPageStyles = window.getComputedStyle(firstPageMeasure);
      const firstPagePaddingTop = parseFloat(firstPageStyles.paddingTop) || 0;
      const firstPagePaddingBottom =
        parseFloat(firstPageStyles.paddingBottom) || 0;

      /*
       * The measurement page itself does not own the visible padding;
       * bookletMeasureContent does. Read those exact values from the
       * measurement content so the pagination follows the current CSS.
       */
      const measureContent = firstPageMeasure.firstElementChild as HTMLElement | null;

      if (!measureContent) return;

      const contentStyles = window.getComputedStyle(measureContent);
      const paddingTop = parseFloat(contentStyles.paddingTop) || firstPagePaddingTop;
      const paddingBottom =
        parseFloat(contentStyles.paddingBottom) || firstPagePaddingBottom;

      const headerStyles = window.getComputedStyle(firstHeaderMeasure);
      const headerMarginBottom = parseFloat(headerStyles.marginBottom) || 0;

      const firstPageHeaderHeight =
        firstHeaderMeasure.getBoundingClientRect().height + headerMarginBottom;

      /*
       * First page:
       * physical height minus the real content padding and the
       * title/artist header.
       */
      const firstPageHeight =
        physicalPageHeight -
        paddingTop -
        paddingBottom -
        firstPageHeaderHeight;

      /*
       * Pages 2+:
       * no header placeholder is present anymore, so the whole
       * remaining content area is available to lyrics.
       */
      const regularPageHeight =
        physicalPageHeight - paddingTop - paddingBottom;

      const lineWidth = lineMeasure.clientWidth;

      if (
        firstPageHeight <= 0 ||
        regularPageHeight <= 0 ||
        lineWidth <= 0
      ) {
        return;
      }

      const normalizedLyrics = lyrics
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const lines = normalizedLyrics.split("\n");

      /*
       * Measure every original source line using the exact
       * typography and width used by the visible lyric column.
       */
      lineMeasure.replaceChildren();

      const lineElements = lines.map((line) => {
        const element = document.createElement("div");
        element.textContent = line === "" ? "\u00A0" : line;

        if (line === "") {
          element.style.height = "6px";
          element.style.minHeight = "6px";
        }

        lineMeasure.appendChild(element);
        return element;
      });

      const lineHeights = lineElements.map((element) =>
        element.getBoundingClientRect().height,
      );

      const fallbackLineHeight = 15 * 1.18;
      const heights = lineHeights.map((height) =>
        height > 0 ? height : fallbackLineHeight,
      );

      const result: string[] = [];
      let currentLines: string[] = [];
      let currentHeight = 0;
      let availableHeight = firstPageHeight;

      const pushCurrentPage = () => {
        if (currentLines.length === 0) return;

        result.push(currentLines.join("\n"));
        currentLines = [];
        currentHeight = 0;
        availableHeight = regularPageHeight;
      };

      const addLine = (line: string, height: number) => {
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

        pushCurrentPage();
        currentLines.push(line);
        currentHeight += height;
      };

      lines.forEach((line, index) => {
        addLine(line, heights[index]);
      });

      pushCurrentPage();

      /*
       * The paginator must never silently lose content.
       * Compare the normalized source with the concatenated pages
       * after removing only page-boundary line breaks.
       */
      const reconstructed = result.join("\n").trim();
      const source = normalizedLyrics.trim();

      if (!reconstructed || !reconstructed.startsWith(source.slice(0, 64))) {
        setPages([lyrics]);
        return;
      }

      setPages(result.length > 0 ? result : [lyrics]);
    };

    paginate();

    const resizeObserver = new ResizeObserver(() => {
      paginate();
    });

    resizeObserver.observe(spread);
    resizeObserver.observe(firstPageMeasure);

    return () => {
      resizeObserver.disconnect();
    };
  }, [lyrics, track]);

  useEffect(() => {
    if (pages.length === 0) {
      setCurrentPage(0);
      return;
    }

    const lastValidPage = Math.max(0, pages.length - 2);
    setCurrentPage((page) => Math.min(page, lastValidPage));
  }, [pages.length]);

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

  const leftPageIdx = currentPage;
  const rightPageIdx = currentPage + 1;

  const hasPreviousPage = currentPage > 0;
  const hasNextPage = rightPageIdx < pages.length - 1;

  const leftPageNumber = leftPageIdx + 1;
  const rightPageNumber =
    rightPageIdx < pages.length ? rightPageIdx + 1 : null;

  const coverUrl = track.album.images[0]?.url;

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
    setCurrentPage((page) =>
      Math.min(Math.max(0, pages.length - 2), page + 2),
    );
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

      <div
        ref={spreadRef}
        className={styles.bookletPageSpread}
        onClick={handlePageClick}
        onKeyDown={handlePageKeyDown}
        role="region"
        tabIndex={isOpen ? 0 : -1}
        aria-label="Booklet de letras"
      >
        <div className={styles.bookletPageStack} />
        <div className={styles.bookletCenterSpine} />

        <div
          className={`${styles.bookletPageHalf} ${styles.bookletPageLeft}`}
        >
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

        <div
          className={`${styles.bookletPageHalf} ${styles.bookletPageRight}`}
        >
          <div className={styles.bookletContent}>
            <div className={styles.bookletLyrics}>
              {loading ? "" : pages[rightPageIdx] || ""}
            </div>
          </div>
        </div>

        {!loading && pages.length > 0 && (
          <>
            <span
              className={styles.bookletPageNumberLeft}
              aria-hidden="true"
            >
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

        <div
          className={styles.bookletPaginationMeasure}
          aria-hidden="true"
        >
          <div className={styles.bookletMeasurePage}>
            <div className={styles.bookletMeasureContent}>
              <div
                ref={firstHeaderMeasureRef}
                className={styles.bookletHeader}
              >
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
              <div className={styles.bookletMeasureLyrics} />
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
