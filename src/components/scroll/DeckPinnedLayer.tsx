"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { NowPlayingResponse } from "@/types/spotify";
import { PhysicalDeck } from "@/components/PhysicalDeck";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { getEmptyPlaybackState, getPlaybackState, subscribePlaybackState } from "@/lib/playbackSnapshotCoordinator";
import { getDockClickEnabled, getServerDockClickEnabled, setDockClickEnabled, subscribeDockClickEnabled } from "@/lib/mechanicalDockClick";
import { supportsDiscFlightMotion, type DiscFlightOrigin } from "@/lib/discFlightGeometry";
import { discRegistry } from "@/lib/discRegistry";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useRailNavigation } from "./RailContext";
import styles from "./DeckPinnedLayer.module.css";

export function DeckPinnedLayer() {
  const { authenticated } = useSpotifyPlayer();
  const { activeChapterIndex } = useRailNavigation();
  const layerRef = useRef<HTMLDivElement>(null);
  const [deckHidden, setDeckHidden] = useState(false);
  const [staticMode, setStaticMode] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const playback = useSyncExternalStore(subscribePlaybackState, getPlaybackState, getEmptyPlaybackState);
  const clickEnabled = useSyncExternalStore(subscribeDockClickEnabled, getDockClickEnabled, getServerDockClickEnabled);
  const playbackRef = useRef(playback);
  playbackRef.current = playback;
  const [dockVisual, setDockVisual] = useState<DiscFlightOrigin | null>(null);
  const priorDockVisual = useRef<DiscFlightOrigin | null>(null);
  const presented = useRef<NowPlayingResponse | null>(null);
  const frozen = useRef<NowPlayingResponse | null>(null);
  const capturedAttempt = useRef<string | null>(null);
  const releasedConfirmation = useRef<string | null>(null);

  // One subscription and one hardware model persist through Deck and Split.
  const { data, error } = useNowPlaying(authenticated === true);
  if (playback.busy && capturedAttempt.current !== playback.attempt?.attemptId) {
    capturedAttempt.current = playback.attempt?.attemptId ?? null;
    frozen.current = presented.current;
    priorDockVisual.current = dockVisual;
  }
  if (!playback.busy) capturedAttempt.current = null;
  const loading = playback.phase === "loading" || playback.phase === "docked";
  const confirmed = playback.phase === "confirmed" ? playback.snapshot : null;
  const hasNewerData = Boolean(data && (data.sampledAt ?? 0) >= (confirmed?.sampledAt ?? Infinity));
  if (confirmed && hasNewerData) releasedConfirmation.current = playback.attempt?.attemptId ?? null;
  const restoring = playback.busy && (playback.phase === "failed" || playback.phase === "cancelled");
  const visibleData = loading || restoring ? frozen.current
    : confirmed && releasedConfirmation.current !== playback.attempt?.attemptId ? confirmed : data;
  if (!loading) presented.current = visibleData;
  const isPlaying = !loading && (visibleData?.isPlaying ?? false);
  const discAlbumId = loading ? playback.attempt?.albumId : visibleData?.track?.album.id;
  const albumName = loading ? playback.attempt?.albumName : visibleData?.track?.album.name;
  const artwork = loading ? playback.attempt?.artworkUrl : visibleData?.track?.album.images[0]?.url;
  const showDisc = playback.phase === "docked" || !loading && Boolean(visibleData?.track);
  const accentColor = useDominantColor(artwork) ?? "#1DB954";
  const registerTarget = useCallback((node: HTMLDivElement | null) => { discRegistry.discTarget = node; }, []);

  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>("[data-rail-wrapper]")?.parentElement;
    if (!railRoot) return;
    const update = () => {
      layerRef.current?.setAttribute("data-deck-interactive", railRoot.dataset.deckInteractive === "false" ? "false" : "true");
      setDeckHidden(railRoot.dataset.deckHidden === "true");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(railRoot, { attributes: true, attributeFilter: ["data-deck-interactive", "data-deck-hidden"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setStaticMode(reduced.matches || !supportsDiscFlightMotion());
    const visibility = () => setDocumentVisible(document.visibilityState === "visible");
    updateMotion(); visibility();
    reduced.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", visibility);
    return () => { reduced.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    const arrived = (event: Event) => {
      const detail = (event as CustomEvent<{ attemptId: string; origin?: DiscFlightOrigin }>).detail;
      const current = playbackRef.current;
      if (detail?.attemptId !== current.attempt?.attemptId || !current.busy || !detail.origin) return;
      setDockVisual(detail.origin);
    };
    window.addEventListener("cdvicious:disc-flight-arrived", arrived);
    return () => window.removeEventListener("cdvicious:disc-flight-arrived", arrived);
  }, []);

  useEffect(() => {
    if (playback.phase === "failed" || playback.phase === "cancelled") setDockVisual(priorDockVisual.current);
  }, [playback.phase, playback.attempt?.attemptId]);

  const cancel = useCallback(() => {
    const current = playbackRef.current;
    if (!current.busy || !current.attempt) return;
    window.dispatchEvent(new CustomEvent("cdvicious:disc-flight-cancelled", { detail: { attemptId: current.attempt.attemptId } }));
  }, []);
  useEffect(() => {
    if (!playback.busy) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopImmediatePropagation(); cancel();
    };
    window.addEventListener("keydown", keydown, true);
    return () => window.removeEventListener("keydown", keydown, true);
  }, [playback.busy, cancel]);

  return <>
    <div ref={layerRef} className={styles.layer} style={{ "--accent-color": accentColor } as CSSProperties}
      data-rail-overlay data-deck-interactive="true" data-deck-hidden={deckHidden}
      data-playback-attempt={playback.attempt?.attemptId ?? ""}
      data-confirmed-attempt={playback.phase === "confirmed" ? playback.attempt?.attemptId ?? "" : ""}
      data-flight-stage={loading ? playback.phase === "docked" ? "docked" : "flying" : "idle"}
      data-playback-phase={playback.phase}>
      <div className={styles.deckCluster}>
        <div className={styles.physicalStage} data-disc-render-enabled={!deckHidden} data-has-track={Boolean(visibleData?.track)}>
          <PhysicalDeck pose={playback.phase === "loading" ? "open" : showDisc ? "docked" : "wait"} lidOffset={0}
            albumName={albumName} artwork={artwork} displayTitle={loading ? "CARGANDO" : visibleData?.track?.name}
            statusText={loading ? albumName : visibleData?.track ? isPlaying ? "REPRODUCIENDO" : "PAUSA" : error ? "SIN SEÑAL" : "INSERT DISC"}
            showDisc={showDisc} isPlaying={isPlaying && documentVisible && !deckHidden}
            staticMode={staticMode} discTargetRef={registerTarget}
            discVisual={dockVisual?.albumId === discAlbumId ? dockVisual : null} />
        </div>
      </div>
      <div className={`${styles.deckActions} ${styles.interactive}`} inert={deckHidden || activeChapterIndex > 1}>
        <button type="button" aria-pressed={clickEnabled} onClick={() => setDockClickEnabled(!clickEnabled)}>CLIC MECÁNICO {clickEnabled ? "ON" : "OFF"}</button>
        {playback.busy && <button type="button" onClick={cancel}>CANCELAR CARGA</button>}
      </div>
      {visibleData?.track && <div className={`${styles.bookletLayer} ${styles.interactive}`} data-rail-booklet>
        <LyricsBooklet track={visibleData.track} isOpen active={activeChapterIndex === 1 && !deckHidden}
          onToggle={() => undefined} accentColor={accentColor} showTab={false} />
      </div>}
    </div>
    <footer className={styles.globalPlayer} aria-label="Reproductor global" data-global-player data-dock-click={playback.dockClick}>
      <NowPlayingCard global track={visibleData?.track ?? null} isPlaying={isPlaying} error={error}
        loading={loading} loadingAlbum={playback.attempt?.albumName}
        progressMs={loading ? null : visibleData?.progressMs ?? null} durationMs={loading ? null : visibleData?.durationMs ?? null} />
    </footer>
  </>;
}
