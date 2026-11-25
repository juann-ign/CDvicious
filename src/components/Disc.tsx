"use client";

import dynamic from "next/dynamic";
import { Component, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import type { SpotifyTrack } from "@/types/spotify";
import { discRegistry } from "@/lib/discRegistry";
import styles from "./Disc/Disc.module.css";

const DiscCanvas = dynamic(
  () => import("./three/DiscCanvas").then((m) => m.DiscCanvas),
  { ssr: false },
);
let webglSupport: boolean | null = null;

class DiscRenderBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface DiscProps {
  track: SpotifyTrack | null;
  isPlaying: boolean;
  accentColor: string;
  renderEnabled?: boolean;
}

export function Disc({
  track,
  isPlaying,
  accentColor,
  renderEnabled = true,
}: DiscProps) {
  const [isTrackRevealed, setIsTrackRevealed] = useState(true);
  const [isRailMoving, setIsRailMoving] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const trackId = track?.id;

  useEffect(() => {
    if (webglSupport !== null) { setWebglAvailable(webglSupport); return; }
    // Probe once per page, then immediately release the temporary
    // context. R3F initializes its renderer asynchronously, outside a React
    // error boundary, so unsupported WebGL must be detected before mounting it.
    const probe = document.createElement("canvas");
    let context: WebGL2RenderingContext | null = null;
    try { context = probe.getContext("webgl2"); } catch { /* static fallback */ }
    webglSupport = Boolean(context);
    setWebglAvailable(webglSupport);
    context?.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);

  // Keep motion-local rendering updates inside the Disc subtree. Subscribing
  // DeckPinnedLayer itself rerenders the pinned VFD, booklet and layout on each
  // rail handoff, which can stall the scroll animation.
  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>(
      "[data-rail-wrapper]",
    )?.parentElement;
    if (!railRoot) return;

    const syncMotionState = () => {
      setIsRailMoving(railRoot.dataset.railMoving === "true");
    };
    syncMotionState();

    const observer = new MutationObserver(syncMotionState);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-rail-moving"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!trackId) {
      setIsTrackRevealed(true);
      return;
    }

    setIsTrackRevealed(false);
    const frame = window.requestAnimationFrame(() => setIsTrackRevealed(true));

    return () => window.cancelAnimationFrame(frame);
  }, [trackId]);

  const glowStyle = { "--accent-color": accentColor } as CSSProperties;
  const staticDisc = <div className={styles.staticDisc} role="img" aria-label={track ? `CD: ${track.album.name}` : "CD sin cargar"}><span>{track?.album.name ?? "COMPACT DISC"}</span><i /></div>;

  return (
    <div
      className={[
        styles.discStage,
        track && !isTrackRevealed ? styles.discStageEntering : "",
      ]
        .filter(Boolean)
        .join(" ")}
      ref={(el) => {
        discRegistry.discTarget = el;
      }}
      data-disc-render-enabled={renderEnabled ? "true" : "false"}
      data-disc-motion-active={isRailMoving ? "true" : "false"}
      data-has-track={track ? "true" : "false"}
    >
      <div
        className={`${styles.discGlow} ${isPlaying ? styles.isActive : ""}`}
        style={glowStyle}
      />
      <div className={styles.disc}>
        {webglAvailable ? <>
        <DiscRenderBoundary fallback={staticDisc}>
        {/* Canvas can suspend while loading textures/HDRI. Keep that suspension
            local so it cannot freeze rail navigation or a confirmed VFD. */}
        <Suspense fallback={staticDisc}>
        <DiscCanvas
          track={track}
          isPlaying={isPlaying}
          accentColor={accentColor}
          renderEnabled={renderEnabled}
          isRailMoving={isRailMoving}
        />
        </Suspense>
        </DiscRenderBoundary>
        </> : staticDisc}
      </div>
    </div>
  );
}
