"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { useDiscSpin } from "@/hooks/useDiscSpin";

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function Disc({ track, isPlaying, accentColor }: DiscProps) {
  const coverUrl = track?.album.images[0]?.url;
  const { elRef, onPointerDown, onPointerMove, onPointerUp } = useDiscSpin(10);

  const previousTrackId = useRef<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (!track) {
      previousTrackId.current = null;
      return;
    }
    if (previousTrackId.current === null) {
      previousTrackId.current = track.id;
      return;
    }
    if (track.id !== previousTrackId.current) {
      setIsRecording(true);
      previousTrackId.current = track.id;
      const t = setTimeout(() => setIsRecording(false), 700);
      return () => clearTimeout(t);
    }
  }, [track]);

  const glowStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <div className="disc-stage">
      <div
        className={`disc-glow ${isPlaying ? "is-active" : ""}`}
        style={glowStyle}
      />

      <div
        className="disc"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="disc__spinner" ref={elRef}>
          <div className="disc__face disc__face--front">
            {coverUrl && (
              <div className="disc__cover">
                <Image
                  src={coverUrl}
                  alt={track!.album.name}
                  fill
                  sizes="480px"
                />
              </div>
            )}
            {!track && <span className="disc__label">DISCO SIN GRABAR</span>}
            <div className="disc__hole" />
            <div className="disc__rim" />
          </div>

          <div className="disc__face disc__face--back">
            <div className="disc__hole" />
            <div className="disc__rim" />
          </div>
        </div>

        {isRecording && <div className="disc__laser" />}
      </div>
    </div>
  );
}
