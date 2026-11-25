"use client";

import { useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ArtistJewelCaseDetail } from "./ArtistJewelCaseDetail";
import styles from "./ArtistDiscography.module.css";

type Props = Omit<ComponentProps<typeof ArtistJewelCaseDetail>, "open" | "onOpened" | "onClosed"> & { expanded: boolean; onClosed: () => void; onOpened?: () => void };

// The scene reserves the neighbouring space first; the exact modal hinge and
// its completion/cancellation live in JewelCasePresentation, not in this shell.
export function ArtistInlineCase({ expanded, onClosed, onOpened, ...detail }: Props) {
  const [hingeOpen, setHingeOpen] = useState(false);
  const [phase, setPhase] = useState("reserving");
  const expandedRef = useRef(expanded);
  const hingeRef = useRef(false);
  expandedRef.current = expanded;
  useLayoutEffect(() => {
    let timer = 0;
    if (expanded) {
      setPhase("reserving");
      const unfold = () => {
        hingeRef.current = true;
        setPhase("opening");
        setHingeOpen(true);
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) unfold();
      else timer = window.setTimeout(unfold, 330);
    } else {
      setPhase("closing");
      if (!hingeRef.current) { setPhase("closed"); onClosed(); }
      else { hingeRef.current = false; setHingeOpen(false); }
    }
    return () => window.clearTimeout(timer);
  }, [expanded, onClosed]);
  return <div className={styles.openCase} data-testid="artist-inline-case" data-album-id={detail.album.id} data-presentation={phase} data-gesture-owner="detail" inert={!expanded}
    onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
    <ArtistJewelCaseDetail {...detail} active={detail.active && expanded} open={hingeOpen}
      onOpened={() => {
        if (!expandedRef.current) return;
        setPhase("open");
        onOpened?.();
        if (detail.active && !detail.pending) detail.discRef.current?.focus({ preventScroll: true });
      }}
      onClosed={() => {
        if (expandedRef.current) return;
        setPhase("closed");
        onClosed();
      }} />
  </div>;
}
