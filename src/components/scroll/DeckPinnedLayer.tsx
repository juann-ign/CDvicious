"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTexture } from "@react-three/drei";
import type { NowPlayingResponse } from "@/types/spotify";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useRail } from "./RailContext";
import pageStyles from "@/app/page.module.css";
import styles from "./DeckPinnedLayer.module.css";

const DISC_PLAYBACK_START_DELAY_MS = 1_000;
const PLAYBACK_SNAPSHOT_TIMEOUT_MS = 15_000;

type DiscFlightStage = "idle" | "flying" | "docked";

export function DeckPinnedLayer() {
  const { authenticated } = useSpotifyPlayer();
  const { isRailMoving } = useRail();
  const [deckInteractive, setDeckInteractive] = useState(true);
  const [deckHidden, setDeckHidden] = useState(false);
  const [awaitingPlaybackSnapshot, setAwaitingPlaybackSnapshot] = useState(false);
  const [flightStage, setFlightStage] = useState<DiscFlightStage>("idle");
  const [frozenData, setFrozenData] = useState<NowPlayingResponse | null>(null);
  const [visualPlaybackReady, setVisualPlaybackReady] = useState(true);
  const [flightPlaybackStarted, setFlightPlaybackStarted] = useState(false);
  const flightStageRef = useRef<DiscFlightStage>("idle");
  const playbackDelayRef = useRef<number | null>(null);
  const playbackSnapshotTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const overlay = document.querySelector<HTMLElement>("[data-rail-overlay]");
    const railRoot = overlay?.parentElement;

    if (!railRoot) return;

    const update = () => {
      setDeckInteractive(railRoot.dataset.deckInteractive !== "false");
      setDeckHidden(railRoot.dataset.deckHidden === "true");
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(railRoot, {
      attributes: true,
      attributeFilter: ["data-deck-interactive", "data-deck-hidden"],
    });

    return () => observer.disconnect();
  }, []);

  const { data, error } = useNowPlaying(
    authenticated === true && (deckInteractive || awaitingPlaybackSnapshot),
  );
  const latestDataRef = useRef(data);
  const playbackSnapshotAtStartRef = useRef(data);

  // Keep the last real track snapshot while the Deck is off-chapter. The hook
  // intentionally returns an empty snapshot when the Deck is not interactive,
  // but a flight launched from Batea/Colección still needs a stable visual
  // snapshot to bridge the disc animation.
  if (data?.track) {
    latestDataRef.current = data;
  }

  const trackCoverUrl = data?.track?.album.images[0]?.url;

  useEffect(() => {
    if (!trackCoverUrl) return;

    // Load the next artwork while the temporary disc is travelling so the
    // persistent Three.js disc is less likely to suspend at the handoff.
    try {
      useTexture.preload(trackCoverUrl);
    } catch {
      // DiscMesh still loads the same texture through its normal Suspense path.
    }
  }, [trackCoverUrl]);

  useEffect(() => {
    const clearPlaybackDelay = () => {
      if (playbackDelayRef.current !== null) {
        window.clearTimeout(playbackDelayRef.current);
        playbackDelayRef.current = null;
      }
    };
    const clearPlaybackSnapshotTimeout = () => {
      if (playbackSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(playbackSnapshotTimeoutRef.current);
        playbackSnapshotTimeoutRef.current = null;
      }
    };

    const handleFlightStarted = () => {
      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
      setAwaitingPlaybackSnapshot(false);
      delete document.documentElement.dataset.discFlightPlaybackReady;
      flightStageRef.current = "flying";
      setFlightStage("flying");
      setFrozenData(latestDataRef.current);
      setVisualPlaybackReady(false);
      setFlightPlaybackStarted(false);
    };

    const beginDockedDelay = () => {
      // "done" is also sent when the Deck target is missing, so the display
      // cannot remain frozen if a flight has to be discarded early.
      if (flightStageRef.current !== "flying") return;

      clearPlaybackDelay();
      flightStageRef.current = "docked";
      setFlightStage("docked");
      setFrozenData(null);
      setVisualPlaybackReady(false);

      playbackDelayRef.current = window.setTimeout(() => {
        playbackDelayRef.current = null;
        // Keep the Deck in the docked phase until the muted player has resumed.
        // This prevents stale Now Playing data from showing playback too early.
        setFrozenData(null);
        setVisualPlaybackReady(true);
        document.documentElement.dataset.discFlightPlaybackReady = "true";
        window.dispatchEvent(new Event("cdvicious:disc-flight-playback-ready"));
      }, DISC_PLAYBACK_START_DELAY_MS);
    };

    const cancelFlight = () => {
      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
      setAwaitingPlaybackSnapshot(false);
      delete document.documentElement.dataset.discFlightPlaybackReady;
      flightStageRef.current = "idle";
      setFlightStage("idle");
      setFrozenData(null);
      setVisualPlaybackReady(true);
      setFlightPlaybackStarted(false);
    };

    const handlePlaybackStarted = () => {
      playbackSnapshotAtStartRef.current = latestDataRef.current;
      flightStageRef.current = "idle";
      setFlightStage("idle");
      setFlightPlaybackStarted(true);
      // Playback can originate off-chapter, where Now Playing polling is normally
      // suspended. Resume it briefly so the persistent Deck receives the confirmed track.
      setAwaitingPlaybackSnapshot(true);
      clearPlaybackSnapshotTimeout();
      playbackSnapshotTimeoutRef.current = window.setTimeout(() => {
        playbackSnapshotTimeoutRef.current = null;
        setAwaitingPlaybackSnapshot(false);
      }, PLAYBACK_SNAPSHOT_TIMEOUT_MS);
    };

    window.addEventListener("cdvicious:disc-flight-started", handleFlightStarted);
    window.addEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
    window.addEventListener("cdvicious:disc-flight-done", beginDockedDelay);
    window.addEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
    window.addEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);

    return () => {
      window.removeEventListener("cdvicious:disc-flight-started", handleFlightStarted);
      window.removeEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
      window.removeEventListener("cdvicious:disc-flight-done", beginDockedDelay);
      window.removeEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
      window.removeEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);
      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
    };
  }, []);

  useEffect(() => {
    if (
      flightPlaybackStarted &&
      data?.track &&
      data !== playbackSnapshotAtStartRef.current
    ) {
      setFlightPlaybackStarted(false);
      setAwaitingPlaybackSnapshot(false);
      if (playbackSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(playbackSnapshotTimeoutRef.current);
        playbackSnapshotTimeoutRef.current = null;
      }
    }
  }, [data, flightPlaybackStarted]);

  // Keep the last real track mounted while DeckPinnedLayer fades out.
  // The polling hook intentionally returns an empty snapshot off-chapter;
  // using that empty value here would swap the CD/booklet midway through the fade.
  const visibleData = flightStage === "flying"
    ? frozenData
    : deckInteractive
      ? data
      : latestDataRef.current;
  const isDockedBeforePlayback =
    flightStage === "docked" && !flightPlaybackStarted;
  const visibleIsPlaying =
    visualPlaybackReady &&
    !isDockedBeforePlayback &&
    (flightPlaybackStarted || (visibleData?.isPlaying ?? false));
  const visibleProgressMs = isDockedBeforePlayback
    ? 0
    : (visibleData?.progressMs ?? null);
  const coverUrl = visibleData?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";
  const stageStyle = {
    "--accent-color": accentColor,
  } as CSSProperties;

  return (
    <div
      className={styles.layer}
      style={stageStyle}
      data-rail-overlay
      data-deck-interactive={deckInteractive ? "true" : "false"}
      data-deck-hidden={deckHidden ? "true" : "false"}
    >
      <header className={pageStyles.topControlBar}>
        <div className={pageStyles.brandCorner}>
          CD<span>vicious</span>
        </div>
        <div className={"top-nav-actions " + styles.interactive}>
          <UserProfileChip />
        </div>
      </header>

      <div className={styles.deckCluster}>
        <div className={pageStyles.centerStage}>
          <div className={styles.discHitArea}>
            <Disc
              track={visibleData?.track ?? null}
              isPlaying={visibleIsPlaying}
              accentColor={accentColor}
              renderEnabled={!deckHidden}
              isRailMoving={isRailMoving}
            />
          </div>
        </div>

        <div className={pageStyles.nowPlayingDock}>
          <div className={styles.interactive}>
            <NowPlayingCard
              track={visibleData?.track ?? null}
              isPlaying={visibleIsPlaying}
              error={error}
              progressMs={visibleProgressMs}
              durationMs={visibleData?.durationMs ?? null}
            />
          </div>
        </div>
      </div>

      {visibleData?.track && (
        <div
          className={styles.bookletLayer + " " + styles.interactive}
          data-rail-booklet
        >
          <LyricsBooklet
            track={visibleData.track}
            isOpen
            onToggle={() => undefined}
            accentColor={accentColor}
            showTab={false}
          />
        </div>
      )}
    </div>
  );
}
