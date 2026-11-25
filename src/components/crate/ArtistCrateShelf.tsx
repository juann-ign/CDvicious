"use client";

import { useMemo, useState } from "react";
import { useArtistShelfLayout } from "@/hooks/useArtistShelfLayout";
import type { AlbumItem } from "@/types/crate";
import { JewelSpine } from "./JewelSpine";
import { JewelFlyout } from "./JewelFlyout";
import skin from "./CrateShelf.module.css";
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
}

/** Artist-only layout; the standalone three-copy Batea remains unchanged. */
export function ArtistCrateShelf({ albums, onSelect, active = true, chapterIndex = 3, onGrabStart, onGrabEnd, className, label = "Páginas de la discografía" }: Props) {
  const unique = useMemo(() => [...new Map(albums.map((album) => [album.id, album])).values()], [albums]);
  const ids = useMemo(() => unique.map((album) => album.id), [unique]);
  const [hovering, setHovering] = useState(false);
  const [driftEnabled, setDriftEnabled] = useState(true);
  const [hover, setHover] = useState<{ album: AlbumItem; anchor: HTMLButtonElement } | null>(null);
  const motion = useArtistShelfLayout({ ids, active, paused: hovering || !driftEnabled, chapterIndex, onGrabStart, onGrabEnd });
  if (!unique.length) return null;
  return <div className={[skin.wrap, styles.artistWrap, className].filter(Boolean).join(" ")} data-artist-shelf data-shelf-chapter={chapterIndex}
    data-belt-animation-enabled="false" data-artist-shelf-layout={motion.layout.fit ? "static" : "cycle"} data-artist-edition-count={unique.length} inert={!active}>
    {!motion.layout.fit && <div className={skin.toolbar}>
      <div className={skin.pageNav}>
        <button type="button" className={skin.chevBtn} onClick={() => motion.stepPage(-1)} aria-label="Página anterior" disabled={motion.layout.fit}>◄</button>
        <button type="button" className={skin.chevBtn} onClick={() => motion.stepPage(1)} aria-label="Página siguiente" disabled={motion.layout.fit}>►</button>
      </div>
      <button type="button" className={skin.beltToggle} disabled={motion.layout.fit || motion.reducedMotion} onClick={() => setDriftEnabled((value) => !value)} aria-label="Desplazamiento automático" aria-pressed={driftEnabled && !motion.layout.fit && !motion.reducedMotion} title={motion.reducedMotion ? "Movimiento reducido · navegación manual" : motion.layout.fit ? "Todas las ediciones están visibles" : driftEnabled ? "Pausar la cinta" : "Reanudar la cinta"}>
        <span className={`${skin.beltDot} ${driftEnabled && !motion.layout.fit && !motion.reducedMotion ? skin.beltDotOn : ""}`} /><span aria-hidden="true">{driftEnabled && !motion.layout.fit && !motion.reducedMotion ? "Ⅱ" : "▶"}</span>
      </button>
    </div>}
    <div className={`${skin.stage} ${styles.artistStage}`} data-batea-tray
      onPointerEnter={() => setHovering(true)} onPointerLeave={() => { setHovering(false); setHover(null); motion.emphasize(null); }}>
      <div ref={motion.containerRef} className={`${skin.viewport} ${styles.artistViewport} ${motion.isDragging ? skin.dragging : ""}`}>
        <div ref={motion.trackRef} className={`${skin.track} ${styles.artistTrack}`}>
          {unique.map((album, index) => <div key={album.id} className={styles.slot} data-artist-slot={album.id}>
            <JewelSpine albumId={album.id} title={album.name} artist={album.artists.map((artist) => artist.name).join(", ")} coverUrl={album.images[0]?.url ?? ""}
              tilt={(index % 5 - 2) * .8} onSelect={(origin) => { motion.remember(album.id); setHover(null); onSelect(album, origin); }}
              onHover={(rect, anchor) => { motion.emphasize(rect && anchor ? album.id : null); setHover(rect && anchor ? { album, anchor } : null); }} />
          </div>)}
        </div>
      </div>
      <div className={skin.fadeLeft} /><div className={skin.fadeRight} />
    </div>
    {motion.pages > 1 && <div className={skin.dots} role="tablist" aria-label={label}>{Array.from({ length: motion.pages }, (_, page) =>
      <button key={page} type="button" role="tab" aria-selected={page === motion.page} className={`${skin.dot} ${page === motion.page ? skin.dotActive : ""}`} onClick={() => motion.goTo(page)} aria-label={`Página ${page + 1}`} />)}</div>}
    {hover && active && <JewelFlyout title={hover.album.name} artist={hover.album.artists.map((artist) => artist.name).join(", ")} coverUrl={hover.album.images[0]?.url ?? ""} year={hover.album.release_date?.slice(0, 4)} anchor={hover.anchor} />}
  </div>;
}
