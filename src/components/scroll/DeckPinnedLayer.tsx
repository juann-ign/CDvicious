"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTexture } from "@react-three/drei";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import * as mockSpotifyStore from "@/lib/mockSpotifyStore";
import * as nowPlayingStore from "@/lib/nowPlayingStore";
import { createPlaybackSnapshotCoordinator } from "@/lib/playbackSnapshotCoordinator";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import pageStyles from "@/app/page.module.css";
import styles from "./DeckPinnedLayer.module.css";

const DISC_PLAYBACK_START_DELAY_MS = 1_000;
const PLAYBACK_SNAPSHOT_TIMEOUT_MS = 15_000;

type DiscFlightStage = "idle" | "flying" | "docked";

export function DeckPinnedLayer() {
  const { authenticated } = useSpotifyPlayer();
  const layerRef = useRef<HTMLDivElement>(null);
  const [deckHidden, setDeckHidden] = useState(false);
  const [awaitingPlaybackSnapshot, setAwaitingPlaybackSnapshot] = useState(false);
  const [flightStage, setFlightStage] = useState<DiscFlightStage>("idle");
  const flightStageRef = useRef<DiscFlightStage>("idle");
  const activeAttemptIdRef = useRef<string | null>(null);
  const playbackDelayRef = useRef<number | null>(null);
  const playbackSnapshotTimeoutRef = useRef<number | null>(null);
  const coordinatorRef = useRef<ReturnType<typeof createPlaybackSnapshotCoordinator> | null>(null);

  if (!coordinatorRef.current) {
    coordinatorRef.current = createPlaybackSnapshotCoordinator({
      initialSnapshot: null,
      confirmationTimeoutMs: PLAYBACK_SNAPSHOT_TIMEOUT_MS,
    });
  }

  const [playbackState, setPlaybackState] = useState(
    () => coordinatorRef.current!.getState(),
  );
  const useNowPlayingEnabled =
    authenticated === true &&
    (!deckHidden || awaitingPlaybackSnapshot || flightStage !== "idle");
  const nowPlaying = useNowPlaying(useNowPlayingEnabled);
  const { data, error, requestSeq, requestStartedAt, receivedAt } = nowPlaying;

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

  // The coordinator is the only authority that promotes observations to the
  // confirmed snapshot consumed by the VFD and the persistent 3D disc.
  useEffect(() => {
    if (!data || requestStartedAt === null || receivedAt === null) return;

    const coordinator = coordinatorRef.current!;
    const currentAttempt = coordinator.getState().attempt;
    const observation = {
      requestSeq,
      requestStartedAt,
      receivedAt,
      snapshot: data,
    };
    const nextState =
      currentAttempt?.status === "pending"
        ? coordinator.acceptSnapshot({
            ...observation,
            attemptId: currentAttempt.id,
          })
        : coordinator.observeSnapshot(observation);

    setPlaybackState(nextState);

    if (nextState.attempt?.status !== "pending") {
      if (playbackSnapshotTimeoutRef.current !== null) {
        window.clearTimeout(playbackSnapshotTimeoutRef.current);
        playbackSnapshotTimeoutRef.current = null;
      }
      setAwaitingPlaybackSnapshot(false);
    }
  }, [data, error, requestSeq, requestStartedAt, receivedAt]);

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
    const publishState = () => {
      const nextState = coordinatorRef.current!.getState();
      setPlaybackState(nextState);
      return nextState;
    };
    const isCurrentAttempt = (attemptId?: string) =>
      Boolean(attemptId && activeAttemptIdRef.current === attemptId);

    const handleFlightStarted = (event: Event) => {
      const detail = (event as CustomEvent<{
        attemptId?: string;
        targetAlbumUri?: string;
        startedAt?: number;
      }>).detail;
      if (!detail?.attemptId || !detail.targetAlbumUri) return;

      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
      delete document.documentElement.dataset.discFlightPlaybackReady;
      delete document.documentElement.dataset.discFlightAttemptId;

      activeAttemptIdRef.current = detail.attemptId;
      const startedAt = detail.startedAt ?? Date.now();
      const requestSeqAtStart =
        process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1"
          ? mockSpotifyStore.getSnapshot().requestSeq
          : nowPlayingStore.getLatestIssuedRequestSeq();
      const nextState = coordinatorRef.current!.beginAttempt({
        attemptId: detail.attemptId,
        targetAlbumUri: detail.targetAlbumUri,
        startedAt,
        requestSeqAtStart,
      });
      setPlaybackState(nextState);

      flightStageRef.current = "flying";
      setFlightStage("flying");
      setAwaitingPlaybackSnapshot(false);

      const timeoutDelay = Math.max(
        0,
        startedAt + PLAYBACK_SNAPSHOT_TIMEOUT_MS - Date.now(),
      );
      playbackSnapshotTimeoutRef.current = window.setTimeout(() => {
        playbackSnapshotTimeoutRef.current = null;
        const expired = coordinatorRef.current!.expireAttempt(
          detail.attemptId!,
          Date.now(),
        );
        setPlaybackState(expired);
        const expiredAttempt = expired.attempt;
        if (
          expiredAttempt &&
          expiredAttempt.id === detail.attemptId &&
          expiredAttempt.status === "degraded"
        ) {
          clearPlaybackDelay();
          delete document.documentElement.dataset.discFlightPlaybackReady;
          delete document.documentElement.dataset.discFlightAttemptId;
          setAwaitingPlaybackSnapshot(false);
          flightStageRef.current = "idle";
          setFlightStage("idle");
          activeAttemptIdRef.current = null;
        }
      }, timeoutDelay);
    };

    const handlePlaybackCommandAccepted = (event: Event) => {
      const detail = (event as CustomEvent<{
        attemptId?: string;
        at?: number;
      }>).detail;
      if (!isCurrentAttempt(detail?.attemptId)) return;

      const nextState = coordinatorRef.current!.markCommandAccepted(
        detail.attemptId!,
        detail.at ?? Date.now(),
      );
      setPlaybackState(nextState);
    };

    const handlePlaybackCommandFailed = (event: Event) => {
      const detail = (event as CustomEvent<{
        attemptId?: string;
        reason?: string;
        at?: number;
      }>).detail;
      if (!isCurrentAttempt(detail?.attemptId)) return;

      const nextState = coordinatorRef.current!.rejectAttempt(
        detail.attemptId!,
        detail.reason ?? "PLAY_COMMAND_FAILED",
        detail.at ?? Date.now(),
      );
      setPlaybackState(nextState);
      clearPlaybackSnapshotTimeout();
      setAwaitingPlaybackSnapshot(false);
    };

    const beginDockedDelay = (event: Event) => {
      const detail = (event as CustomEvent<{ attemptId?: string }>).detail;
      if (!isCurrentAttempt(detail?.attemptId)) return;
      const attempt = coordinatorRef.current!.getState().attempt;
      if (
        !attempt ||
        attempt.id !== detail?.attemptId ||
        (attempt.status !== "pending" && attempt.status !== "confirmed")
      ) {
        return;
      }
      if (flightStageRef.current !== "flying") return;

      clearPlaybackDelay();
      flightStageRef.current = "docked";
      setFlightStage("docked");

      playbackDelayRef.current = window.setTimeout(() => {
        playbackDelayRef.current = null;
        if (!isCurrentAttempt(detail?.attemptId)) return;
        document.documentElement.dataset.discFlightPlaybackReady = "true";
        document.documentElement.dataset.discFlightAttemptId = detail!.attemptId!;
        window.dispatchEvent(
          new CustomEvent("cdvicious:disc-flight-playback-ready", {
            detail: { attemptId: detail!.attemptId },
          }),
        );
      }, DISC_PLAYBACK_START_DELAY_MS);
    };

    const cancelFlight = (event: Event) => {
      const detail = (event as CustomEvent<{ attemptId?: string }>).detail;
      if (!isCurrentAttempt(detail?.attemptId)) return;

      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
      delete document.documentElement.dataset.discFlightPlaybackReady;
      delete document.documentElement.dataset.discFlightAttemptId;

      const currentState = coordinatorRef.current!.getState();
      if (currentState.attempt?.status === "pending") {
        coordinatorRef.current!.rejectAttempt(
          detail!.attemptId!,
          "PLAYBACK_CANCELLED",
          Date.now(),
        );
      }
      publishState();

      flightStageRef.current = "idle";
      setFlightStage("idle");
      setAwaitingPlaybackSnapshot(false);
      activeAttemptIdRef.current = null;
    };

    const handlePlaybackStarted = (event: Event) => {
      const detail = (event as CustomEvent<{
        attemptId?: string;
        targetAlbumUri?: string;
      }>).detail;
      if (!isCurrentAttempt(detail?.attemptId)) return;

      const attempt = coordinatorRef.current!.getState().attempt;
      if (
        !attempt ||
        attempt.id !== detail?.attemptId ||
        (attempt.status !== "pending" && attempt.status !== "confirmed")
      ) {
        return;
      }

      flightStageRef.current = "idle";
      setFlightStage("idle");

      if (attempt.status === "confirmed") {
        clearPlaybackSnapshotTimeout();
        setAwaitingPlaybackSnapshot(false);
        return;
      }

      setAwaitingPlaybackSnapshot(true);
      if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
        const mockState = mockSpotifyStore.getSnapshot();
        if (
          mockState.data &&
          mockState.requestStartedAt >= attempt.startedAt
        ) {
          coordinatorRef.current!.acceptSnapshot({
            attemptId: detail!.attemptId!,
            requestSeq: mockState.requestSeq,
            requestStartedAt: mockState.requestStartedAt,
            receivedAt: mockState.receivedAt,
            snapshot: mockState.data,
          });
          const nextState = publishState();
          if (nextState.attempt?.status !== "pending") {
            clearPlaybackSnapshotTimeout();
            setAwaitingPlaybackSnapshot(false);
          }
        }
      } else {
        // This read starts after the playback-resumed signal. Any request that
        // was already in flight is followed by a queued, strictly newer read.
        nowPlayingStore.refreshForPlaybackConfirmation();
      }
    };

    window.addEventListener("cdvicious:disc-flight-started", handleFlightStarted);
    window.addEventListener("cdvicious:playback-command-accepted", handlePlaybackCommandAccepted);
    window.addEventListener("cdvicious:playback-command-failed", handlePlaybackCommandFailed);
    window.addEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
    window.addEventListener("cdvicious:disc-flight-done", beginDockedDelay);
    window.addEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
    window.addEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);

    return () => {
      window.removeEventListener("cdvicious:disc-flight-started", handleFlightStarted);
      window.removeEventListener("cdvicious:playback-command-accepted", handlePlaybackCommandAccepted);
      window.removeEventListener("cdvicious:playback-command-failed", handlePlaybackCommandFailed);
      window.removeEventListener("cdvicious:disc-flight-arrived", beginDockedDelay);
      window.removeEventListener("cdvicious:disc-flight-done", beginDockedDelay);
      window.removeEventListener("cdvicious:disc-flight-cancelled", cancelFlight);
      window.removeEventListener("cdvicious:disc-flight-playback-started", handlePlaybackStarted);
      clearPlaybackDelay();
      clearPlaybackSnapshotTimeout();
    };
  }, []);

  const isPlaybackPending = playbackState.attempt?.status === "pending";
  const visibleData =
    playbackState.confirmedSnapshot ?? (isPlaybackPending ? null : data);
  const trackCoverUrl = visibleData?.track?.album.images[0]?.url;

  useEffect(() => {
    if (!trackCoverUrl) return;

    // Preload only the confirmed artwork; provisional target albums do not
    // become visual truth before their snapshot has been accepted.
    try {
      useTexture.preload(trackCoverUrl);
    } catch {
      // DiscMesh still loads the same texture through its normal Suspense path.
    }
  }, [trackCoverUrl]);

  const visibleIsPlaying =
    !isPlaybackPending && (visibleData?.isPlaying ?? false);
  const playbackStatus =
    playbackState.attempt?.status === "pending"
      ? "pending"
      : playbackState.attempt?.status === "failed"
        ? "failed"
        : playbackState.attempt?.status === "degraded"
          ? "degraded"
          : visibleData
            ? "confirmed"
            : "unavailable";
  const visibleProgressMs = isPlaybackPending
    ? null
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
            />
          </div>
        </div>

        <div className={pageStyles.nowPlayingDock}>
          <div className={styles.interactive}>
            <NowPlayingCard
              track={visibleData?.track ?? null}
              isPlaying={visibleIsPlaying}
              error={error}
              playbackStatus={playbackStatus}
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
