"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { NowPlayingResponse } from "@/types/spotify";
import { PhysicalDeck } from "@/components/PhysicalDeck";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { DeckTrackSelector } from "@/components/DeckTrackSelector";
import { DeckNextDiscs, DeckNextListenButton } from "@/components/crate/DeckNextDiscs";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { getEmptyPlaybackState, getPlaybackState, subscribePlaybackState } from "@/lib/playbackSnapshotCoordinator";
import { supportsDiscFlightMotion, type DiscFlightOrigin } from "@/lib/discFlightGeometry";
import { discRegistry } from "@/lib/discRegistry";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useRailNavigation } from "./RailContext";
import styles from "./DeckPinnedLayer.module.css";
import { useCanonicalPlayerControls } from "@/hooks/useCanonicalPlayerControls";
import type { DeckLiftPhase } from "@/lib/deckLiftPrototype";

export function DeckPinnedLayer() {
  const { authenticated } = useSpotifyPlayer();
  const controls = useCanonicalPlayerControls();
  const { activeChapterIndex } = useRailNavigation();
  const [liftPhase, setLiftPhase] = useState<DeckLiftPhase>("docked");
  const layerRef = useRef<HTMLDivElement>(null);
  const listingRef = useRef<HTMLDivElement>(null);
  const listenButton = useRef<HTMLButtonElement>(null);
  const listenPanelId = useId();
  const [listenChapter, setListenChapter] = useState<number | null>(null);
  const [listenMounted, setListenMounted] = useState(false);
  const [listenMotion, setListenMotion] = useState(false);
  const listenAttempt = useRef<string | null>(null);
  const [railMoving, setRailMoving] = useState(false);
  const [deckHidden, setDeckHidden] = useState(false);
  const [staticMode, setStaticMode] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const playback = useSyncExternalStore(subscribePlaybackState, getPlaybackState, getEmptyPlaybackState);
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
  const prototypePlayerActive = liftPhase !== "docked";
  const footerVisible = activeChapterIndex > 1 || prototypePlayerActive;
  const listingAvailable = activeChapterIndex <= 1 && !deckHidden && !playback.busy
    && (liftPhase === "docked" || liftPhase === "free");
  const listenAvailable = authenticated === true && activeChapterIndex <= 1 && !deckHidden && !playback.busy && liftPhase === "docked";
  const listenOpen = listenAvailable && listenChapter === activeChapterIndex;
  const placement = activeChapterIndex === 1 ? "split" : "deck";
  const speakersVisible = activeChapterIndex <= 1 && !deckHidden && !playback.busy;

  const closeListen = useCallback((restoreFocus = false) => {
    setListenChapter(null);
    setListenMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (restoreFocus) listenButton.current?.focus({ preventScroll: true });
  }, []);
  const toggleListen = () => {
    if (listenOpen) { closeListen(); return; }
    if (railMoving || !listenAvailable) return;
    setListenMounted(true);
    setListenChapter(activeChapterIndex);
    setListenMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  useEffect(() => {
    if (!listenMotion) return;
    const timeout = window.setTimeout(() => setListenMotion(false), 540);
    return () => window.clearTimeout(timeout);
  }, [listenChapter, listenMotion]);

  useEffect(() => {
    if (listenChapter === null) { listenAttempt.current = null; return; }
    if (authenticated !== true) { setListenChapter(null); setListenMotion(false); return; }
    if (playback.busy) {
      listenAttempt.current = playback.attempt?.attemptId ?? null;
      setListenMotion(false);
      return;
    }
    if (listenAttempt.current) {
      if (playback.phase === "confirmed") { setListenChapter(null); return; }
      // A failed flight can return from Deck to its source in Split.
      if (activeChapterIndex !== listenChapter || railMoving) return;
      listenAttempt.current = null;
    }
    if (activeChapterIndex !== listenChapter) {
      setListenChapter(null);
      setListenMotion(false);
    }
  }, [activeChapterIndex, authenticated, listenChapter, playback.attempt?.attemptId, playback.busy, playback.phase, railMoving]);

  useEffect(() => {
    if (!listenOpen) return;
    const rail = layerRef.current?.parentElement?.querySelector<HTMLElement>("[data-rail-wrapper]");
    const chapter = rail?.firstElementChild?.children[activeChapterIndex] as HTMLElement | undefined;
    if (!rail || !chapter) return;
    const leave = () => {
      // Detail focus and rail locks can emit movement flags at the same position.
      if (playbackRef.current.busy || rail.parentElement?.dataset.railMoving !== "true"
        || Math.abs(rail.scrollLeft - chapter.offsetLeft) < 2) return;
      setListenChapter(null);
      setListenMotion(false);
    };
    rail.addEventListener("scroll", leave, { passive: true });
    return () => rail.removeEventListener("scroll", leave);
  }, [activeChapterIndex, listenOpen]);

  useEffect(() => {
    if (!listenOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || layerRef.current?.closest("[data-album-detail-open=true]")) return;
      event.preventDefault();
      closeListen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeListen, listenOpen]);

  useLayoutEffect(() => {
    const layer = layerRef.current;
    const listing = listingRef.current;
    const trigger = listing?.querySelector("button");
    // Split has its own fixed listing inset and width. Measure the free Deck
    // only when its rail camera is settled, including the return from Split.
    if (activeChapterIndex !== 0 || railMoving || liftPhase !== "free" || !listingAvailable || !layer || !listing || !trigger) return;

    const place = () => {
      const disc = layer.querySelector("[data-prototype-disc=true]")?.getBoundingClientRect();
      const surfaces = [...layer.querySelectorAll("[data-deck-surface]")].map((surface) => surface.getBoundingClientRect());
      if (!disc?.width || !surfaces.length) return;
      const viewport = layer.getBoundingClientRect();
      const button = trigger.getBoundingClientRect();
      const margin = 24;
      const gap = 16;
      const preferredLeft = Math.max(margin, Math.min(192, viewport.width * .10));
      const readableWidth = Math.max(216, button.width);
      const equipmentLeft = Math.min(...surfaces.map(({ left }) => left));
      let right = Math.min(equipmentLeft, disc.left) - gap;

      // Keep the button near its docked position. On narrow, tall layouts the
      // player can fill the upper band, so use the space beside the CD below it.
      const belowEquipment = right - margin < readableWidth;
      if (belowEquipment) right = disc.left - gap;
      const left = Math.max(margin, Math.min(preferredLeft, right - readableWidth));
      listing.style.left = `${left}px`;
      listing.style.setProperty("--track-listing-width", `${Math.max(1, right - left)}px`);
      if (belowEquipment) {
        const top = Math.max(...surfaces.map(({ bottom }) => bottom)) + gap;
        listing.style.top = `${top}px`;
        listing.style.setProperty("--track-listing-height", `${Math.min(350, Math.max(0, viewport.bottom - top - button.height - 8 - gap))}px`);
      } else {
        listing.style.removeProperty("top");
        listing.style.removeProperty("--track-listing-height");
      }
    };

    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    });
    place();
    observer.observe(layer);
    observer.observe(trigger);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      for (const property of ["left", "top", "--track-listing-width", "--track-listing-height"]) {
        listing.style.removeProperty(property);
      }
    };
  }, [activeChapterIndex, railMoving, liftPhase, listingAvailable]);

  useEffect(() => {
    const railRoot = document.querySelector<HTMLElement>("[data-rail-wrapper]")?.parentElement;
    if (!railRoot) return;
    const update = () => {
      layerRef.current?.setAttribute("data-deck-interactive", railRoot.dataset.deckInteractive === "false" ? "false" : "true");
      setDeckHidden(railRoot.dataset.deckHidden === "true");
      setRailMoving(railRoot.dataset.railMoving === "true");
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(railRoot, { attributes: true, attributeFilter: ["data-deck-interactive", "data-deck-hidden", "data-rail-moving"] });
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
    <div ref={listingRef} className={styles.trackListing} data-track-listing-placement={placement}>
      <DeckTrackSelector enabled={listingAvailable}
        track={visibleData?.track ?? null} controls={controls} />
    </div>
    {listenAvailable && <div className={styles.nextListen} data-track-listing-placement={placement}>
      <DeckNextListenButton open={listenOpen} disabled={railMoving && !listenOpen} buttonRef={listenButton} panelId={listenPanelId} onToggle={toggleListen} />
    </div>}
    <div ref={layerRef} className={styles.layer} style={{ "--accent-color": accentColor } as CSSProperties}
      data-rail-overlay data-deck-interactive="true" data-deck-hidden={deckHidden} data-lift-chapter={placement}
      data-next-listen-open={listenOpen} data-next-listen-motion={listenMotion && !railMoving && !playback.busy}
      data-playback-attempt={playback.attempt?.attemptId ?? ""}
      data-confirmed-attempt={playback.phase === "confirmed" ? playback.attempt?.attemptId ?? "" : ""}
      data-flight-stage={loading ? playback.phase === "docked" ? "docked" : "flying" : "idle"}
      data-playback-phase={playback.phase}>
      <div className={styles.deckCluster}>
        <div className={styles.physicalStage} data-disc-render-enabled={!deckHidden} data-has-track={Boolean(visibleData?.track)}>
          <PhysicalDeck pose={playback.phase === "loading" ? "open" : showDisc ? "docked" : "wait"} lidOffset={0} loading={loading}
            albumName={albumName} artwork={artwork} displayTitle={loading ? "CARGANDO" : visibleData?.track?.name}
            statusText={loading ? albumName : visibleData?.track ? isPlaying ? "REPRODUCIENDO" : "PAUSA" : error ? "SIN SEÑAL" : "INSERT DISC"}
            showDisc={showDisc} isPlaying={isPlaying && documentVisible && !deckHidden}
            artistText={visibleData?.track?.artists.map((artist) => artist.name).join(", ")}
            progressMs={loading ? null : visibleData?.progressMs ?? null}
            durationMs={loading ? null : visibleData?.durationMs ?? null}
            staticMode={staticMode} discTargetRef={registerTarget} controls={controls} controlsActive={!deckHidden && activeChapterIndex <= 1}
            speakersEnabled speakersVisible={speakersVisible} speakersActive={speakersVisible && documentVisible}
            albumId={discAlbumId} liftEnabled liftActive={!deckHidden && activeChapterIndex <= 1} liftChapter={placement}
            track={visibleData?.track ?? null} accentColor={accentColor}
            liftBusy={playback.busy || listenOpen || listenMotion} onLiftPhaseChange={setLiftPhase}
            discVisual={dockVisual?.albumId === discAlbumId ? dockVisual : null} />
        </div>
      </div>
      <div className={`${styles.deckActions} ${styles.interactive}`} inert={deckHidden || activeChapterIndex > 1}>
        {playback.busy && <button type="button" onClick={cancel}>CANCELAR CARGA</button>}
        {(controls.volumeError || controls.transportError) && <span role="status">{controls.volumeError ?? controls.transportError}<button type="button" onClick={() => void controls.refreshVolume()} disabled={controls.blocked || controls.volumeLoading}>Consultar dispositivo</button></span>}
      </div>
      {visibleData?.track && <div className={`${styles.bookletLayer} ${styles.interactive}`} data-rail-booklet inert={listenOpen}>
        <LyricsBooklet track={visibleData.track} isOpen active={activeChapterIndex === 1 && !deckHidden && !listenOpen}
          onToggle={() => undefined} accentColor={accentColor} showTab={false} />
      </div>}
      <DeckNextDiscs open={listenOpen} mounted={listenMounted} panelId={listenPanelId}
        chapterIndex={activeChapterIndex} currentAlbumId={discAlbumId} />
    </div>
    <footer className={styles.globalPlayer} aria-label="Reproductor global" data-global-player data-dock-click={playback.dockClick}
      data-footer-visible={footerVisible} data-prototype-player-active={prototypePlayerActive} aria-hidden={!footerVisible} inert={!footerVisible}>
      <NowPlayingCard global track={visibleData?.track ?? null} isPlaying={isPlaying} error={error}
        loading={loading} loadingAlbum={playback.attempt?.albumName}
        progressMs={loading ? null : visibleData?.progressMs ?? null} durationMs={loading ? null : visibleData?.durationMs ?? null} />
    </footer>
  </>;
}
