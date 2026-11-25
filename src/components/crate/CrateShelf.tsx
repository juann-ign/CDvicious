"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { isMarqueeChapterActive, useMarqueeBelt } from "@/hooks/useMarqueeBelt";
import { useArtistShelfLayout } from "@/hooks/useArtistShelfLayout";
import { JewelSpine } from "./JewelSpine";
import { JewelFlyout } from "./JewelFlyout";
import type { AlbumItem } from "@/types/crate";
import styles from "./CrateShelf.module.css";

interface CrateShelfProps {
  albums: AlbumItem[];
  onSelect: (album: AlbumItem, origin: HTMLButtonElement) => void;
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
  active?: boolean;
  chapterIndex?: number;
  className?: string;
  label?: string;
  mode?: "loop" | "ordered";
  /** Automatic drift for the main shelf; ordered shelves keep their own clock. */
  autoSpeed?: number;
  startAt?: "center" | "leading";
}

type ShelfProps = CrateShelfProps & { active: boolean; chapterIndex: number; label: string };

interface ShelfMotion {
  containerRef: RefObject<HTMLDivElement | null>;
  trackRef: RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  page: number;
  pages: number;
  fit?: boolean;
  reducedMotion?: boolean;
  goTo: (page: number) => void;
  stepPage: (direction: -1 | 1) => void;
  remember?: (id: string) => void;
  emphasize?: (id: string | null) => void;
}

const COPIES = 3;
const GAP = 8;
const MAX_PAGES = 6;

function useShelfInteraction() {
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const [hover, setHover] = useState<{ album: AlbumItem; anchor: HTMLButtonElement } | null>(null);
  return { hovering, setHovering, focused, setFocused, driftEnabled, setDriftEnabled, hover, setHover };
}

export function CrateShelf({
  mode = "loop",
  active = true,
  chapterIndex = mode === "ordered" ? 3 : 2,
  label = mode === "ordered" ? "Páginas de la discografía" : "Páginas de la batea",
  ...props
}: CrateShelfProps) {
  if (!props.albums.length) return null;
  const shelf = { ...props, active, chapterIndex, label };
  return mode === "ordered" ? <OrderedShelf {...shelf} /> : <LoopShelf {...shelf} />;
}

function LoopShelf(props: ShelfProps) {
  const { albums, active, chapterIndex, autoSpeed = 60, onGrabStart, onGrabEnd } = props;
  const interaction = useShelfInteraction();
  const [length, setLength] = useState(0);
  const firstCopyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (firstCopyRef.current) setLength(firstCopyRef.current.offsetWidth + GAP);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (firstCopyRef.current) observer.observe(firstCopyRef.current);
    return () => observer.disconnect();
  }, [albums.length]);

  const pages = Math.max(1, Math.min(MAX_PAGES, albums.length));
  const motion = useMarqueeBelt({
    speed: autoSpeed,
    enabled: active,
    paused: !interaction.driftEnabled || interaction.hovering || interaction.focused,
    length,
    pages,
    chapterIndex,
    onGrabStart,
    onGrabEnd,
  });

  return <ShelfView {...props} mode="loop" interaction={interaction} motion={{ ...motion, pages }} firstCopyRef={firstCopyRef} />;
}

function OrderedShelf(props: ShelfProps) {
  const { albums, active, chapterIndex, onGrabStart, onGrabEnd, startAt = "center" } = props;
  const unique = useMemo(() => [...new Map(albums.map((album) => [album.id, album])).values()], [albums]);
  const ids = useMemo(() => unique.map((album) => album.id), [unique]);
  const interaction = useShelfInteraction();
  const motion = useArtistShelfLayout({
    ids, active, paused: interaction.hovering || !interaction.driftEnabled, chapterIndex, onGrabStart, onGrabEnd, startAt,
  });
  return <ShelfView {...props} albums={unique} mode="ordered" interaction={interaction} motion={{ ...motion, fit: motion.layout.fit }} />;
}

function ShelfView({
  albums, onSelect, active, chapterIndex, className, label, mode,
  motion, interaction, firstCopyRef,
}: ShelfProps & {
  mode: "loop" | "ordered";
  motion: ShelfMotion;
  interaction: ReturnType<typeof useShelfInteraction>;
  firstCopyRef?: RefObject<HTMLDivElement | null>;
}) {
  const { setHovering, setFocused, driftEnabled, setDriftEnabled, hover, setHover } = interaction;
  const wrapRef = useRef<HTMLDivElement>(null);
  const ordered = mode === "ordered";
  const drifting = driftEnabled && !motion.fit && !motion.reducedMotion;
  const showControls = !ordered || !motion.fit;

  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>("[data-rail-wrapper]")?.parentElement;
    const sync = () => {
      const available = active && !document.hidden && isMarqueeChapterActive(railRoot?.dataset, chapterIndex);
      // The ordered model publishes its own animation details to this same root.
      if (!ordered) wrapRef.current?.setAttribute("data-belt-animation-enabled", String(available));
      if (!available) setHover(null);
    };
    sync();
    const observer = railRoot ? new MutationObserver(sync) : null;
    observer?.observe(railRoot!, { attributes: true, attributeFilter: ["data-chapter", "data-rail-moving", "data-album-detail-open"] });
    document.addEventListener("visibilitychange", sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [active, chapterIndex, ordered, setHover]);

  const cases = albums.map((album, index) => (
    <JewelSpine key={album.id} albumId={album.id} title={album.name}
      artist={album.artists.map((artist) => artist.name).join(", ")} coverUrl={album.images[0]?.url ?? ""}
      tilt={(index % 5 - 2) * .8}
      onSelect={(origin) => {
        motion.remember?.(album.id);
        setHover(null);
        onSelect(album, origin);
      }}
      onHover={(rect, anchor) => {
        motion.emphasize?.(rect && anchor ? album.id : null);
        setHover(rect && anchor ? { album, anchor } : null);
      }} />
  ));

  return (
    <div
      ref={wrapRef}
      className={[styles.wrap, ordered && styles.orderedWrap, className].filter(Boolean).join(" ")}
      data-shelf-presentation="metal"
      data-shelf-mode={mode}
      data-shelf-chapter={chapterIndex}
      data-belt-animation-enabled="false"
      data-artist-shelf={ordered || undefined}
      data-artist-shelf-layout={ordered ? (motion.fit ? "static" : "cycle") : undefined}
      data-artist-edition-count={ordered ? albums.length : undefined}
      inert={!active}
    >
      {showControls && <div className={styles.toolbar} data-shelf-toolbar>
        <div className={styles.pageNav}>
          <button type="button" className={styles.chevBtn} data-shelf-arrow onClick={() => motion.stepPage(-1)}
            aria-label="Página anterior">
            <span aria-hidden="true">◄</span>
          </button>
          <button type="button" className={styles.chevBtn} data-shelf-arrow onClick={() => motion.stepPage(1)}
            aria-label="Página siguiente">
            <span aria-hidden="true">►</span>
          </button>
        </div>
        <button type="button" className={styles.beltToggle} data-shelf-toggle
          disabled={motion.reducedMotion} onClick={() => setDriftEnabled((value) => !value)}
          aria-label="Desplazamiento automático" aria-pressed={Boolean(drifting)}
          title={motion.reducedMotion ? "Movimiento reducido · navegación manual" : driftEnabled ? "Pausar la cinta" : "Reanudar la cinta"}>
          <span className={[styles.beltDot, drifting && styles.beltDotOn].filter(Boolean).join(" ")} />
          <span aria-hidden="true">{drifting ? "Ⅱ" : "▶"}</span>
        </button>
      </div>}
      <div
        className={`${styles.stage} ${styles.metalRack}`}
        data-batea-tray
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => {
          setHovering(false);
          setHover(null);
          motion.emphasize?.(null);
        }}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
        }}
      >
        <div ref={motion.containerRef} data-shelf-viewport className={[styles.viewport, motion.isDragging && styles.dragging].filter(Boolean).join(" ")}>
          <div ref={motion.trackRef} data-shelf-track className={[styles.track, ordered && styles.orderedTrack].filter(Boolean).join(" ")}>
            {ordered ? cases.map((item, index) => (
              <div key={albums[index].id} className={styles.slot} data-artist-slot={albums[index].id}>{item}</div>
            )) : Array.from({ length: COPIES }, (_, copy) => (
              <div key={copy} ref={copy === 0 ? firstCopyRef : undefined} className={styles.copy} style={{ gap: GAP }}>{cases}</div>
            ))}
          </div>
        </div>
        <div className={styles.fadeLeft} />
        <div className={styles.fadeRight} />
      </div>
      {(!ordered || motion.pages > 1) && <div className={styles.dots} data-shelf-dots role="tablist" aria-label={label}>
        {Array.from({ length: motion.pages }, (_, page) => (
          <button key={page} type="button" role="tab" aria-selected={page === motion.page}
            className={[styles.dot, page === motion.page && styles.dotActive].filter(Boolean).join(" ")}
            onClick={() => motion.goTo(page)} aria-label={`Página ${page + 1}`} />
        ))}
      </div>}
      {hover && active && (
        <JewelFlyout title={hover.album.name} artist={hover.album.artists.map((artist) => artist.name).join(", ")}
          coverUrl={hover.album.images[0]?.url ?? ""} year={hover.album.release_date?.slice(0, 4)} anchor={hover.anchor} />
      )}
    </div>
  );
}
