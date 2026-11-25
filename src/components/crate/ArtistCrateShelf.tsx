"use client";

import { useMemo, useState } from "react";
import { useArtistShelfLayout } from "@/hooks/useArtistShelfLayout";
import type { AlbumItem } from "@/types/crate";
import { JewelSpine } from "./JewelSpine";
import { JewelFlyout } from "./JewelFlyout";
import skin from "./CrateShelf.module.css";
import presentation from "./JewelShelfPresentation.module.css";
import styles from "./ArtistCrateShelf.module.css";

interface Props {
  albums: AlbumItem[];
  onSelect: (album: AlbumItem, origin: HTMLButtonElement) => void;
  active?: boolean;
  chapterIndex?: number;
  onGrabStart?: () => void;
  onGrabEnd?: () => void;
  className?: string;
  label?: string;
  startAt?: "center" | "leading";
}

/** One physical case per edition, in the order supplied by the caller. */
export function ArtistCrateShelf({ albums, onSelect, active = true, chapterIndex = 3, onGrabStart, onGrabEnd, className, label = "Páginas de la discografía", startAt = "center" }: Props) {
  const unique = useMemo(() => [...new Map(albums.map((album) => [album.id, album])).values()], [albums]);
  const ids = useMemo(() => unique.map((album) => album.id), [unique]);
  const [hovering, setHovering] = useState(false);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const [hover, setHover] = useState<{ album: AlbumItem; anchor: HTMLButtonElement } | null>(null);
  const motion = useArtistShelfLayout({ ids, active, paused: hovering || !driftEnabled, chapterIndex, onGrabStart, onGrabEnd, startAt });
  if (!unique.length) return null;
  return <div className={[skin.wrap, presentation.embedded, styles.artistWrap, className].filter(Boolean).join(" ")} data-artist-shelf data-shelf-chapter={chapterIndex} data-shelf-presentation="embedded"
    data-belt-animation-enabled="false" data-artist-shelf-layout={motion.layout.fit ? "static" : "cycle"} data-artist-edition-count={unique.length} inert={!active}>
    {!motion.layout.fit && <div className={skin.toolbar} data-shelf-toolbar>
      <div className={skin.pageNav}>
        <button type="button" className={skin.chevBtn} data-shelf-arrow onClick={() => motion.stepPage(-1)} aria-label="Página anterior" disabled={motion.layout.fit}><svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m11 4-5 5 5 5" /></svg></button>
        <button type="button" className={skin.chevBtn} data-shelf-arrow onClick={() => motion.stepPage(1)} aria-label="Página siguiente" disabled={motion.layout.fit}><svg viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="m7 4 5 5-5 5" /></svg></button>
      </div>
      <button type="button" className={skin.beltToggle} data-shelf-toggle disabled={motion.layout.fit || motion.reducedMotion} onClick={() => setDriftEnabled((value) => !value)} aria-label="Desplazamiento automático" aria-pressed={driftEnabled && !motion.layout.fit && !motion.reducedMotion} title={motion.reducedMotion ? "Movimiento reducido · navegación manual" : motion.layout.fit ? "Todas las ediciones están visibles" : driftEnabled ? "Pausar la cinta" : "Reanudar la cinta"}>
        <span className={`${skin.beltDot} ${driftEnabled && !motion.layout.fit && !motion.reducedMotion ? skin.beltDotOn : ""}`} /><svg viewBox="0 0 18 18" fill="none" aria-hidden="true">{driftEnabled && !motion.layout.fit && !motion.reducedMotion ? <path d="M6 4v10M12 4v10" /> : <path d="m6 3 8 6-8 6Z" />}</svg>
      </button>
    </div>}
    <div className={`${skin.stage} ${styles.artistStage}`} data-batea-tray
      onPointerEnter={() => setHovering(true)} onPointerLeave={() => { setHovering(false); setHover(null); motion.emphasize(null); }}>
      <div ref={motion.containerRef} className={`${skin.viewport} ${styles.artistViewport} ${motion.isDragging ? skin.dragging : ""}`}>
        <div ref={motion.trackRef} className={`${skin.track} ${styles.artistTrack}`}>
          {unique.map((album, index) => <div key={album.id} className={styles.slot} data-artist-slot={album.id}>
            <JewelSpine albumId={album.id} title={album.name} artist={album.artists.map((artist) => artist.name).join(", ")} coverUrl={album.images[0]?.url ?? ""} presentation="refined"
              tilt={(index % 5 - 2) * .8} onSelect={(origin) => { motion.remember(album.id); setHover(null); onSelect(album, origin); }}
              onHover={(rect, anchor) => { motion.emphasize(rect && anchor ? album.id : null); setHover(rect && anchor ? { album, anchor } : null); }} />
          </div>)}
        </div>
      </div>
    </div>
    {motion.pages > 1 && <div className={skin.dots} data-shelf-dots role="tablist" aria-label={label}>{Array.from({ length: motion.pages }, (_, page) =>
      <button key={page} type="button" role="tab" aria-selected={page === motion.page} className={`${skin.dot} ${page === motion.page ? skin.dotActive : ""}`} onClick={() => motion.goTo(page)} aria-label={`Página ${page + 1}`} />)}</div>}
    {hover && active && <JewelFlyout title={hover.album.name} artist={hover.album.artists.map((artist) => artist.name).join(", ")} coverUrl={hover.album.images[0]?.url ?? ""} year={hover.album.release_date?.slice(0, 4)} anchor={hover.anchor} />}
  </div>;
}
