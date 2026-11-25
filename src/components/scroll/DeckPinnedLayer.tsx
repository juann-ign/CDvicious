"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useTexture } from "@react-three/drei";
import type { NowPlayingResponse } from "@/types/spotify";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { getConfirmedPlayback, subscribePlaybackConfirmation } from "@/lib/playbackSnapshotCoordinator";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import pageStyles from "@/app/page.module.css";
import styles from "./DeckPinnedLayer.module.css";

const DISC_PLAYBACK_START_DELAY_MS = 1_000;

type DiscFlightStage = "idle" | "flying" | "docked";
const getEmptyConfirmation = () => null;

export function DeckPinnedLayer() {
  const { authenticated } = useSpotifyPlayer();
  const layerRef = useRef<HTMLDivElement>(null);
  const [deckHidden, setDeckHidden] = useState(false);
  const [flightStage, setFlightStage] = useState<DiscFlightStage>("idle");
  const [flightDiscVisible, setFlightDiscVisible] = useState(false);
  const [frozenData, setFrozenData] = useState<NowPlayingResponse | null>(null);
  const [visualPlaybackReady, setVisualPlaybackReady] = useState(true);
  const [playbackSnapshotOverride, setPlaybackSnapshotOverride] =
    useState<NowPlayingResponse | null>(null);
  const flightStageRef = useRef<DiscFlightStage>("idle");
  const activeAttemptRef = useRef<string | null>(null);
  const confirmedPlayback = useSyncExternalStore(subscribePlaybackConfirmation, getConfirmedPlayback, getEmptyConfirmation);
  const playbackDelayRef = useRef<number | null>(null);

  useEffect(() => {
    const overlay = document.querySelector<HTMLElement>("[data-rail-overlay]");
    const railRoot = overlay?.parentElement;

    if (!railRoot) return;

    const update = () => {
      const interactive = railRoot.dataset.deckInteractive !== "false";
      const interactiveValue = interactive ? "true" : "false";
      if (layerRef.current?.dataset.deckInteractive !== interactiveValue) {
        layerRef.current?.setAttribute("data-deck-interactive", interactiveValue);
      }

      const hidden = railRoot.dataset.deckHidden === "true";
      setDeckHidden((current) => (current === hidden ? current : hidden));
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
    authenticated === true &&
      (!deckHidden || flightStage !== "idle"),
  );
  const latestDataRef = useRef(data);

  // Keep the last real track snapshot while the Deck is off-chapter. The hook
  // intentionally returns an empty snapshot when the Deck is not interactive,
  // but a flight launched from Batea/Colección still needs a stable visual
  // snapshot to bridge the disc animation.
  if (flightStage === "idle" && data?.track && !playbackSnapshotOverride) {
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
    const handleFlightStarted = (event: Event) => {
      activeAttemptRef.current = (event as CustomEvent<{attemptId: string}>).detail?.attemptId ?? null;
      clearPlaybackDelay();
      setPlaybackSnapshotOverride(null);

      delete document.documentElement.dataset.discFlightPlaybackReady;
      flightStageRef.current = "flying";
      setFlightDiscVisible(true);
      setFlightStage("flying");
      setFrozenData(latestDataRef.current);
      setVisualPlaybackReady(false);
    };

    const beginDockedDelay = () => {
      // "done" is also sent when the Deck target is missing, so the display
      // cannot remain frozen if a flight has to be discarded early.
      if (flightStageRef.current !== "flying") return;

      clearPlaybackDelay();
      flightStageRef.current = "docked";
      setFlightStage("docked");
      setVisualPlaybackReady(false);

      playbackDelayRef.current = window.setTimeout(() => {
        playbackDelayRef.current = null;
        // Keep the Deck in the docked phase until the muted player has resumed.
        // This prevents stale Now Playing data from showing playback too early.

        document.documentElement.dataset.discFlightPlaybackReady = "true";
        window.dispatchEvent(new Event("cdvicious:disc-flight-playback-ready"));
      }, DISC_PLAYBACK_START_DELAY_MS);
    };

    const cancelFlight = () => {
      clearPlaybackDelay();
      setFlightDiscVisible(false);
      activeAttemptRef.current = null;

      delete document.documentElement.dataset.discFlightPlaybackReady;
      flightStageRef.current = "idle";
      setFlightStage("idle");
      setPlaybackSnapshotOverride(latestDataRef.current);
      setFrozenData(null);
      setVisualPlaybackReady(true);
    };

    const handlePlaybackStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ attemptId: string }>).detail;
      const confirmation = getConfirmedPlayback();
      if (!detail || detail.attemptId !== activeAttemptRef.current || confirmation?.attemptId !== detail.attemptId) return;
      const snapshot = confirmation.snapshot;
      latestDataRef.current = snapshot;
      setPlaybackSnapshotOverride(snapshot);
      setFrozenData(null);
      setFlightStage("idle");
      flightStageRef.current = "idle";
      setVisualPlaybackReady(true);
    };
    const handleFlightDone = () => {
      setFlightDiscVisible(false);
      beginDockedDelay();
    };

    window.addEventListener("cdvicious:disc-flight-started", handleFlightStarted);
    window.addEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
    window.addEventListener("cdvicious:disc-flight-done", handleFlightDone);
    window.addEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
    window.addEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);

    return () => {
      window.removeEventListener("cdvicious:disc-flight-started", handleFlightStarted);
      window.removeEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
      window.removeEventListener("cdvicious:disc-flight-done", handleFlightDone);
      window.removeEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
      window.removeEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);
      clearPlaybackDelay();
    };
  }, []);

  useEffect(() => {
    if (flightStage !== "idle" || !data?.track || !playbackSnapshotOverride?.track) return;
    if (data.track.album.id === playbackSnapshotOverride.track.album.id && data.isPlaying &&
      (data.sampledAt ?? 0) >= (playbackSnapshotOverride.sampledAt ?? 0)) {
      activeAttemptRef.current = null;
      setPlaybackSnapshotOverride(null);
    }
  }, [data, flightStage, playbackSnapshotOverride]);

  // Keep the last real track mounted while DeckPinnedLayer fades out.
  // The polling hook intentionally returns an empty snapshot off-chapter;
  // using that empty value here would swap the CD/booklet midway through the fade.
  const activeConfirmation = confirmedPlayback?.attemptId === activeAttemptRef.current ? confirmedPlayback : null;
  const visibleData = activeConfirmation?.snapshot ?? (flightStage !== "idle"
    ? frozenData
    : playbackSnapshotOverride ??
      (deckHidden ? latestDataRef.current : data));
  const isDockedBeforePlayback =
    flightStage === "docked";
  const visibleIsPlaying =
    (Boolean(activeConfirmation) || visualPlaybackReady) &&
    (Boolean(activeConfirmation) || !isDockedBeforePlayback) &&
    (visibleData?.isPlaying ?? false);
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
      ref={layerRef}
      data-rail-overlay
      data-deck-interactive="true"
      data-deck-hidden={deckHidden ? "true" : "false"}
      data-playback-attempt={activeAttemptRef.current ?? ""}
      data-confirmed-attempt={confirmedPlayback?.attemptId ?? ""}
      data-flight-stage={flightStage}
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
          <div className={styles.discHitArea} style={{ visibility: flightDiscVisible || flightStage !== "idle" ? "hidden" : undefined }}>
            <Disc
              track={visibleData?.track ?? null}
              isPlaying={visibleIsPlaying}
              accentColor={accentColor}
              renderEnabled={!deckHidden && !flightDiscVisible && flightStage === "idle"}
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
