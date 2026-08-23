"use client";

import Image from "next/image";
import type { SpotifyTrack } from "@/types/spotify";

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
}

export function Disc({ track, isPlaying }: DiscProps) {
  const coverUrl = track?.album.images[0]?.url;
  const state = !track ? "virgin" : isPlaying ? "playing" : "paused";

  return (
    <div className={`disc disc--${state}`}>
      {coverUrl && (
        <div className="disc__cover">
          <Image src={coverUrl} alt={track!.album.name} fill sizes="260px" />
        </div>
      )}
      {!track && <span className="disc__label">DISCO SIN GRABAR</span>}
      <div className="disc__hole" />
    </div>
  );
}
