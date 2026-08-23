"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { useDiscDrag } from "@/hooks/useDiscDrag";

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function Disc({ track, isPlaying, accentColor }: DiscProps) {
  const coverUrl = track?.album.images[0]?.url;
  const state = !track ? "virgin" : isPlaying ? "playing" : "paused";
  const { rotation, isDragging, onPointerDown, onPointerMove, onPointerUp } =
    useDiscDrag();

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

  const discStyle = {
    transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
    "--accent-color": accentColor,
  } as CSSProperties;

  return (
    <div className="disc-stage">
      <div
        className={`disc ${isDragging ? "disc--dragging" : ""}`}
        style={discStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className={`disc__spinner disc__spinner--${state}`}>
          <div className="disc__face disc__face--front">
            {coverUrl && (
              <div className="disc__cover">
                <Image
                  src={coverUrl}
                  alt={track!.album.name}
                  fill
                  sizes="420px"
                />
              </div>
            )}
            <div className="disc__halo" />
            {!track && <span className="disc__label">DISCO SIN GRABAR</span>}
            <div className="disc__hole" />
          </div>

          <div className="disc__face disc__face--back">
            <div className="disc__hole" />
          </div>
        </div>
        {isRecording && <div className="disc__laser" />}
      </div>
    </div>
  );
}
