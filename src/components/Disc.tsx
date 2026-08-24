"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { useDiscSpin } from "@/hooks/useDiscSpin";
import { useDiscTilt } from "@/hooks/useDiscTilt";

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
}

export function Disc({ track, isPlaying, accentColor }: DiscProps) {
  const coverUrl = track?.album.images[0]?.url;
  const {
    elRef,
    onPointerDown: spinDown,
    onPointerMove: spinMove,
    onPointerUp: spinUp,
  } = useDiscSpin(0);
  const {
    tilt,
    isDragging,
    onPointerDown: tiltDown,
    onPointerMove: tiltMove,
    onPointerUp: tiltUp,
  } = useDiscTilt();

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

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    spinDown(e);
    tiltDown(e);
  }
  function handlePointerMove(e: React.PointerEvent) {
    spinMove(e);
    tiltMove(e);
  }
  function handlePointerUp() {
    spinUp();
    tiltUp();
  }

  const glowStyle = { "--accent-color": accentColor } as CSSProperties;
  const discStyle = {
    transform: `rotateX(${tilt}deg)`,
    transition: isDragging
      ? "none"
      : "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
  } as CSSProperties;

  return (
    <div className="disc-stage">
      <div
        className={`disc-glow ${isPlaying ? "is-active" : ""}`}
        style={glowStyle}
      />

      <div
        className={`disc ${isDragging ? "disc--dragging" : ""}`}
        style={discStyle}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="disc__spinner" ref={elRef}>
          <div className="disc__face disc__face--front">
            {coverUrl && (
              <div className="disc__cover">
                <Image
                  src={coverUrl}
                  alt={track!.album.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 500px"
                  style={{
                    objectFit: "cover", // Expande la imagen para llenar el contenedor
                  }}
                />
              </div>
            )}
            <div className="disc__collar" />
            <div className="disc__collar-line" />
            <div className="disc__sheen" />
            <div className="disc__spotlight" />
            {!track && <span className="disc__label">DISCO SIN GRABAR</span>}

            <div className="disc__center">
              <div className="disc__hole" />
              <div className="disc__ring disc__ring--bright" />
              <div className="disc__ring disc__ring--halo disc__ring--halo-1" />
              <div className="disc__ring disc__ring--halo disc__ring--halo-2" />
              <div className="disc__ring disc__ring--halo disc__ring--halo-3" />
            </div>

            <div className="disc__edge" />
          </div>

          <div className="disc__face disc__face--back">
            <div className="disc__prism">
              <span className="disc__prism-blob p1" />
              <span className="disc__prism-blob p2" />
              <span className="disc__prism-blob p3" />
              <span className="disc__prism-blob p4" />
              <span className="disc__prism-blob p5" />
            </div>

            <div className="disc__center">
              <div className="disc__hole" />
              <div className="disc__ring disc__ring--bright" />
            </div>
          </div>
        </div>

        {isRecording && <div className="disc__laser" />}
      </div>
    </div>
  );
}
