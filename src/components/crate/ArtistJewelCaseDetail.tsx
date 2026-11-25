"use client";

import type { RefObject } from "react";
import type { ArtistRelease } from "@/types/artist";
import { JewelCasePresentation } from "./JewelCasePresentation";

interface Props {
  album: ArtistRelease;
  active: boolean;
  pending: boolean;
  open: boolean;
  hiddenDiscId?: string;
  discRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onOpened?: () => void;
  onClosed?: () => void;
  onPlay?: (album: ArtistRelease, origin: HTMLElement) => void;
}

// Artist owns its context and playback handoff. The physical case, data,
// accessible CD gesture and hinge are exactly the modal's shared presentation.
export function ArtistJewelCaseDetail({ album, active, pending, open, hiddenDiscId, discRef, onClose, onOpened, onClosed }: Props) {
  return <JewelCasePresentation album={album} open={open} active={active} disabled={pending} hideDisc={hiddenDiscId === album.id}
    discRef={discRef} variant="inline" artwork={album.artworkSource === "demo" ? "cover" : "neutral"}
    onOpen={() => undefined} onClose={onClose} onOpened={onOpened} onClosed={onClosed} />;
}
