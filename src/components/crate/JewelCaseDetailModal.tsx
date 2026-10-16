"use client";

import Image from "next/image";
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import type { CSSProperties } from "react";
import type { AlbumItem, AlbumTrack } from "@/types/crate";
import { useDiscSurfaceDrag } from "@/hooks/useDiscSurfaceDrag";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { RailContext } from "@/components/scroll/RailContext";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";
import densityStyles from "./JewelCaseDetailModal.density.module.css";
import motionStyles from "./JewelCaseDetailModal.motion.module.css";

const CASE_OPEN_DURATION_MS = 900;
const CASE_CLOSE_START_MS = 240;
const CASE_CLOSE_MS = 620;
const POST_CLOSE_HOLD_MS = 160;
const EXIT_MS = 340;

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not(:disabled)",
  "input:not(:disabled):not([type='hidden'])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

type ActiveModalEntry = {
  getDialog: () => HTMLDivElement | null;
  isLaunching: () => boolean;
  close: () => void;
};

const activeModalEntries = new Map<symbol, ActiveModalEntry>();
let modalKeydownListener: ((event: KeyboardEvent) => void) | null = null;

function getFocusableElements(dialog: HTMLDivElement): HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((element) => {
    return (
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      !element.closest('[aria-hidden="true"], [inert]') &&
      element.getClientRects().length > 0
    );
  });
}

function handleModalKeydown(event: KeyboardEvent) {
  const entries = Array.from(activeModalEntries.values());
  const activeModal = entries[entries.length - 1];
  const dialog = activeModal?.getDialog();

  if (!activeModal || !dialog) return;

  if (event.key === "Escape") {
    if (!activeModal.isLaunching()) {
      event.preventDefault();
      activeModal.close();
    }
    return;
  }

  if (event.key !== "Tab") return;

  const focusable = getFocusableElements(dialog);

  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const activeElement = document.activeElement as HTMLElement | null;
  const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1;

  if (activeIndex === -1) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && activeIndex === 0) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && activeIndex === focusable.length - 1) {
    event.preventDefault();
    first.focus();
  }
}

function registerModal(entryId: symbol, entry: ActiveModalEntry) {
  activeModalEntries.set(entryId, entry);

  if (!modalKeydownListener) {
    modalKeydownListener = handleModalKeydown;
    window.addEventListener("keydown", modalKeydownListener);
  }

  document.documentElement.dataset.modalOpen = "true";
}

function unregisterModal(entryId: symbol) {
  activeModalEntries.delete(entryId);

  if (activeModalEntries.size === 0) {
    delete document.documentElement.dataset.modalOpen;

    if (modalKeydownListener) {
      window.removeEventListener("keydown", modalKeydownListener);
      modalKeydownListener = null;
    }
  } else {
    document.documentElement.dataset.modalOpen = "true";
  }
}

type PlayApiResponse = {
  success?: boolean;
  error?: string;
  message?: string;
};

function getPlayFailureMessage(
  status: number,
  response: PlayApiResponse | null,
): string {
  if (response?.message) return response.message;

  if (
    response?.error === "AUTH_REQUIRED" ||
    response?.error === "SPOTIFY_AUTH_EXPIRED" ||
    status === 401
  ) {
    return "Tu sesión de Spotify expiró. Volvé a iniciar sesión.";
  }

  if (response?.error === "DEVICE_NOT_AVAILABLE") {
    return "El dispositivo de Spotify no está disponible. Activá un dispositivo e intentá de nuevo.";
  }

  if (status === 403) {
    return "Spotify no permitió la reproducción. Verificá tu cuenta y los permisos.";
  }

  if (status === 429) {
    return "Spotify está limitando las solicitudes. Esperá un momento e intentá de nuevo.";
  }

  return "Spotify no confirmó la reproducción. Podés intentarlo de nuevo.";
}

export type PlayExecutionResult = {
  success: boolean;
  message?: string;
};

export type StartPlayExecution = () => Promise<PlayExecutionResult>;

function waitForWindowEvent(eventName: string, timeoutMs: number): Promise<void> {
  if (
    eventName === "cdvicious:disc-flight-playback-ready" &&
    document.documentElement.dataset.discFlightPlaybackReady === "true"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let timeoutId: number | null = null;

    const finish = () => {
      window.removeEventListener(eventName, finish);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      resolve();
    };

    window.addEventListener(eventName, finish);
    timeoutId = window.setTimeout(finish, timeoutMs);
  });
}

function fmt(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

interface JewelCaseDetailModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
  onPlay?: (originEl: HTMLElement, executePlayback: StartPlayExecution) => void;
  initialPlayError?: string | null;
}

interface ReleaseMeta {
  year?: string;
  label?: string;
  catalogNumber?: string;
  format?: string;
  country?: string;
  tags?: string[];
}

export function JewelCaseDetailModal({
  album,
  onClose,
  onLoad,
  onPlay,
  initialPlayError = null,
}: JewelCaseDetailModalProps) {
  const [tracks, setTracks] = useState<AlbumTrack[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isCaseOpen, setIsCaseOpen] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isPlayPending, setIsPlayPending] = useState(false);
  const [isOpeningForPlay, setIsOpeningForPlay] = useState(false);
  const [playError, setPlayError] = useState<string | null>(initialPlayError);
  const [isLifting, setIsLifting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [launchOrigin, setLaunchOrigin] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const rail = useContext(RailContext);
  const stopRail = rail?.stop;
  const startRail = rail?.start;
  const { deviceId, isReady, player } = useSpotifyPlayer();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const railLockTokenRef = useRef(Symbol("jewel-case-modal"));
  const onCloseRef = useRef(onClose);
  const onLoadRef = useRef(onLoad);
  const isLaunchingRef = useRef(isLaunching);
  const isPlayPendingRef = useRef(isPlayPending);

  onCloseRef.current = onClose;
  onLoadRef.current = onLoad;
  isLaunchingRef.current = isLaunching;
  isPlayPendingRef.current = isPlayPending;
  const [releaseMeta, setReleaseMeta] = useState<ReleaseMeta>(() => ({
    year: album.release_date?.slice(0, 4),
    label: album.label,
    format: "COMPACT DISC",
    tags: album.genres ?? [],
  }));
  const discRef = useRef<HTMLDivElement>(null);
  const launchDiscRef = useRef<HTMLDivElement>(null);
  const launchSpinnerRef = useRef<HTMLDivElement>(null);
  const pendingPlayRef = useRef(false);
  const playStartedRef = useRef(false);
  const launchTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const handedOffRef = useRef(false);
  const {
    rotation: discDragRotation,
    isDragging: isDiscDragging,
    pointerHandlers: discPointerHandlers,
  } = useDiscSurfaceDrag(
    !isCaseOpen || isLaunching || isPlayPending || isOpeningForPlay,
  );
  useLayoutEffect(() => {
    const modalOwner = railLockTokenRef.current;

    registerModal(modalOwner, {
      getDialog: () => dialogRef.current,
      isLaunching: () => isLaunchingRef.current || isPlayPendingRef.current,
      close: () => onCloseRef.current(),
    });

    return () => {
      unregisterModal(modalOwner);
    };
  }, []);

  const coverUrl =
    [...album.images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]?.url ??
    album.images[0]?.url;

  useEffect(() => {
    let cancelled = false;

    if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
      setTracks(
        Array.from({ length: 10 }, (_, index) => ({
          name: "DEMO TRACK " + String(index + 1).padStart(2, "0"),
          duration_ms: 150000 + index * 9000,
        })),
      );
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    fetch(`/api/album/${album.id}/tracks`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setTracks(data.tracks ?? []);
      })
      .catch(() => {
        if (!cancelled) setTracks([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [album.id]);

  useEffect(() => {
    let cancelled = false;
    setReleaseMeta({
      year: album.release_date?.slice(0, 4),
      label: album.label ?? "CDvicious Demo Label",
      format: "COMPACT DISC",
      country: "AR",
      tags: album.genres ?? [],
    });

    if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
      return () => {
        cancelled = true;
      };
    }

    const query = new URLSearchParams({
      artist: album.artists.map((artist) => artist.name).join(", "),
      album: album.name,
    });

    fetch(
      `/api/album/${encodeURIComponent(album.id)}/release-meta?${query.toString()}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ReleaseMeta | null) => {
        if (!cancelled && data) {
          setReleaseMeta((current) => ({
            ...current,
            ...data,
            tags: data.tags?.length ? data.tags : current.tags,
          }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [album.id, album.artists, album.name, album.release_date, album.label, album.genres]);

  useLayoutEffect(() => {
    const lockToken = railLockTokenRef.current;
    stopRail?.(lockToken);
    const previousActive = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      setIsOpen(true);
      closeButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      startRail?.(lockToken);
      const anotherModalIsActive = Array.from(activeModalEntries.keys()).some(
        (owner) => owner !== railLockTokenRef.current,
      );

      if (
        !anotherModalIsActive &&
        previousActive &&
        document.contains(previousActive)
      ) {
        previousActive.focus();
      }
    };
  }, [startRail, stopRail]);

  // Escape and Tab are handled by the single shared modal keyboard listener.

  const handleOpenCase = () => {
    if (!isCaseOpen && !isPlayPending && !isLaunching && !isOpeningForPlay) {
      setIsCaseOpen(true);
    }
  };

  const handleCloseCase = () => {
    if (
      isCaseOpen &&
      !isPlayPending &&
      !isLaunching &&
      !isOpeningForPlay
    ) {
      setIsCaseOpen(false);
    }
  };

  const beginLaunch = useCallback(() => {
    const disc = discRef.current;
    if (!disc || isLaunching) return;

    const rect = disc.getBoundingClientRect();
    setLaunchOrigin({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
    setIsLaunching(true);
    setIsLifting(true);
  }, [isLaunching]);

  const beginPlay = useCallback(() => {
    if (isLaunching || isPlayPending || playStartedRef.current) return;

    const disc = discRef.current;
    if (!disc) return;

    if (!deviceId || !isReady || !player) {
      setPlayError(
        "No hay un dispositivo Spotify activo. Abrí Spotify y esperá a que el reproductor se conecte.",
      );
      setIsOpeningForPlay(false);
      pendingPlayRef.current = false;
      return;
    }

    setPlayError(null);
    playStartedRef.current = true;

    if (onPlay) {
      // The parent starts the flight immediately. The execution task mutes the
      // Spotify SDK, starts the play request in parallel with travel, then
      // restores volume only after docking + the one-second settle period.
      const executePlayback: StartPlayExecution = async () => {
        let previousVolume = 0.5;
        let muted = false;

        const restoreVolume = async () => {
          if (!muted) return;

          try {
            await player.setVolume(previousVolume);
          } catch {
            // Avoid leaving the Spotify device silent if restoring the prior
            // volume fails transiently.
            await player.setVolume(0.5).catch(() => undefined);
          } finally {
            muted = false;
          }
        };

        try {
          previousVolume = await player.getVolume().catch(() => 0.5);
          await player.setVolume(0);
          muted = true;

          const response = await fetch("/api/play", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uri: album.uri, deviceId }),
          });
          const result = (await response.json().catch(() => null)) as
            | PlayApiResponse
            | null;

          if (!response.ok || result?.success !== true) {
            await restoreVolume();
            return {
              success: false,
              message: getPlayFailureMessage(response.status, result),
            };
          }

          // Spotify starts preparing playback while the CD is in transit.
          // Pause it while muted, then restart from 0 after docking + 1 second
          // so the listener doesn't miss the opening seconds during the flight.
          await player.pause().catch(() => undefined);

          // Timeout is a safety valve for a destroyed rail. The Deck signals
          // readiness one second after the disc reaches its destination.
          await waitForWindowEvent("cdvicious:disc-flight-playback-ready", 15_000);
          await player.seek(0).catch(() => undefined);
          await player.resume();
          await restoreVolume();
          window.dispatchEvent(new Event("cdvicious:disc-flight-playback-started"));
          window.dispatchEvent(new Event("cdvicious:player_state_changed"));
          return { success: true };
        } catch {
          await restoreVolume();
          return {
            success: false,
            message: "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.",
          };
        }
      };

      window.dispatchEvent(new Event("cdvicious:disc-flight-started"));
      onPlay(disc, executePlayback);
      onClose();
      return;
    }

    // Fallback for modal consumers that do not provide a flying-disc handler.
    setIsPlayPending(true);
    void fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: album.uri, deviceId }),
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as
          | PlayApiResponse
          | null;

        if (!response.ok || result?.success !== true) {
          setPlayError(getPlayFailureMessage(response.status, result));
          playStartedRef.current = false;
          return;
        }

        beginLaunch();
      })
      .catch(() => {
        setPlayError(
          "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.",
        );
        playStartedRef.current = false;
      })
      .finally(() => {
        setIsPlayPending(false);
      });
  }, [
    album.uri,
    beginLaunch,
    deviceId,
    isLaunching,
    isPlayPending,
    isReady,
    onClose,
    onPlay,
    player,
  ]);

  const handlePlay = useCallback(() => {
    if (isLaunching || isPlayPending || isOpeningForPlay || playStartedRef.current) {
      return;
    }

    setPlayError(null);

    if (!deviceId || !isReady || !player) {
      setPlayError(
        "No hay un dispositivo Spotify activo. Abrí Spotify y esperá a que el reproductor se conecte.",
      );
      return;
    }

    if (!isCaseOpen) {
      pendingPlayRef.current = true;
      setIsOpeningForPlay(true);
      setIsCaseOpen(true);
      return;
    }

    beginPlay();
  }, [
    beginPlay,
    deviceId,
    isCaseOpen,
    isLaunching,
    isOpeningForPlay,
    isPlayPending,
    isReady,
    player,
  ]);

  useEffect(() => {
    if (!isCaseOpen || isLaunching || !pendingPlayRef.current) return;

    const timer = window.setTimeout(() => {
      pendingPlayRef.current = false;
      setIsOpeningForPlay(false);
      beginPlay();
    }, CASE_OPEN_DURATION_MS);

    return () => window.clearTimeout(timer);
  }, [beginPlay, isCaseOpen, isLaunching]);

  useEffect(() => {
    if (
      !isLaunching ||
      !launchOrigin ||
      !launchDiscRef.current ||
      !launchSpinnerRef.current
    ) {
      return;
    }

    const disc = launchDiscRef.current;
    const spinner = launchSpinnerRef.current;
    handedOffRef.current = false;
    launchTimelineRef.current?.kill();

    gsap.set(disc, {
      left: launchOrigin.left + launchOrigin.width / 2,
      top: launchOrigin.top + launchOrigin.height / 2,
      width: launchOrigin.width,
      height: launchOrigin.height,
      xPercent: -50,
      yPercent: -50,
      y: 0,
      scale: 0.92,
      opacity: 1,
      rotate: 0,
    });
    gsap.set(spinner, { rotate: 0 });

    const tl = gsap.timeline();
    launchTimelineRef.current = tl;

    tl.fromTo(
      disc,
      { scale: 0.92, y: 0 },
      {
        scale: 1.14,
        y: -56,
        duration: 0.2,
        ease: "back.out(3.2)",
      },
    );
    tl.to(disc, {
      scale: 1,
      y: -40,
      duration: 0.16,
      ease: "power1.out",
    });
    tl.to(
      spinner,
      {
        rotate: 1080,
        duration: 1.36,
        ease: "none",
      },
      0,
    );
    tl.call(() => setIsCaseOpen(false), [], CASE_CLOSE_START_MS / 1000);
    tl.to(
      disc,
      {
        y: -72,
        duration: (CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
        ease: "sine.inOut",
      },
      CASE_CLOSE_START_MS / 1000,
    );
    tl.call(
      () => setIsExiting(true),
      [],
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
    );
    tl.to(
      disc,
      {
        y: -82,
        duration: EXIT_MS / 1000,
        ease: "sine.inOut",
      },
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS) / 1000,
    );
    tl.call(
      () => {
        if (handedOffRef.current || !launchDiscRef.current) return;
        handedOffRef.current = true;
        onLoadRef.current(launchDiscRef.current);
      },
      [],
      (CASE_CLOSE_START_MS + CASE_CLOSE_MS + POST_CLOSE_HOLD_MS + EXIT_MS) /
        1000,
    );

    return () => {
      tl.kill();
      launchTimelineRef.current = null;
    };
  }, [isLaunching, launchOrigin]);

  useEffect(() => {
    return () => {
      launchTimelineRef.current?.kill();
      pendingPlayRef.current = false;
    };
  }, []);

  const denseTracklist = !loading && (tracks?.length ?? 0) > 14;
  const trackRows = Math.ceil((tracks?.length ?? 0) / 2);
  const leftTransform = isCaseOpen
    ? "perspective(1500px) rotateY(9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const rightTransform = isCaseOpen
    ? "perspective(1500px) rotateY(-9deg)"
    : "perspective(1500px) rotateY(0deg)";
  const discTransform = isCaseOpen
    ? "translateZ(12px) scale(1) rotate(-25deg)"
    : "translateZ(-6px) scale(0.82) rotate(-8deg)";

  return (
    <div
      className={[styles.overlay, isExiting ? styles.overlayExiting : ""].filter(Boolean).join(" ")}
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((a) => a.name).join(", ")}`}
    >
      <button
        type="button"
        className={styles.scrim}
        onClick={() => !isLaunching && !isPlayPending && !isOpeningForPlay && onClose()}
        aria-label="Cerrar"
        disabled={isLaunching || isPlayPending || isOpeningForPlay}
      />

      <div
        className={[styles.sheet, polishStyles.modalPolish, isOpen ? styles.sheetOpen : "", isLaunching ? styles.sheetLaunching : ""].filter(Boolean).join(" ")}
      >
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>álbum / caja de CD</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>
              {album.artists.map((a) => a.name).join(", ")}
              {album.release_date?.slice(0, 4)
                ? ` · ${album.release_date.slice(0, 4)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            className={styles.closeBtn}
            onClick={() => !isLaunching && !isPlayPending && !isOpeningForPlay && onClose()}
            disabled={isLaunching || isPlayPending || isOpeningForPlay}
            aria-label="Cerrar"
          >
            <span className={polishStyles.closeIcon} aria-hidden="true">
              ×
            </span>
            <span className={polishStyles.closeLabel}>cerrar</span>
          </button>
        </header>

        <div className={styles.casePerspective}>
          <div className={styles.caseShell}>
            <div className={motionStyles.closedStage}>
              {!isCaseOpen && (
                <button
                  type="button"
                  className={motionStyles.closedHitArea}
                  onClick={handleOpenCase}
                  aria-label={`Abrir caja de CD de ${album.name}`}
                />
              )}

              <aside
                className={`${motionStyles.closedMeta} ${isCaseOpen ? motionStyles.closedMetaOpen : ""}`}
                aria-hidden={isCaseOpen}
              >
                <div className={motionStyles.closedMetaPanel}>
                  <div className={motionStyles.closedMetaHeader}>
                    <span>RELEASE DATA</span>
                    <span>{releaseMeta?.format ?? "COMPACT DISC"}</span>
                  </div>
                  <div className={motionStyles.closedMetaGrid}>
                    <div>
                      <small>YEAR</small>
                      <strong>
                        {releaseMeta?.year ??
                          album.release_date?.slice(0, 4) ??
                          "—"}
                      </strong>
                    </div>
                    <div>
                      <small>COUNTRY</small>
                      <strong>{releaseMeta?.country ?? "—"}</strong>
                    </div>
                    <div>
                      <small>LABEL</small>
                      <strong>{releaseMeta?.label ?? "—"}</strong>
                    </div>
                    <div>
                      <small>GENRE</small>
                      <strong>
                        {releaseMeta.tags?.slice(0, 2).join(" · ") || "—"}
                      </strong>
                    </div>
                  </div>
                  <div className={motionStyles.closedMetaTags}>
                    {(releaseMeta?.tags?.length
                      ? releaseMeta.tags
                      : (album.genres ?? [])
                    )
                      .slice(0, 3)
                      .map((tag) => (
                        <span key={tag}>{tag}</span>
                      ))}
                  </div>
                  <div
                    className={motionStyles.closedMetaCode}
                    aria-hidden="true"
                  />
                </div>
              </aside>

              <section
                className={`${motionStyles.closedFace} ${isCaseOpen ? motionStyles.closedFaceOpen : ""}`}
                aria-hidden="true"
              >
                <div className={motionStyles.closedFacePanel}>
                  <div className={motionStyles.closedArtwork}>
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt={album.name}
                        fill
                        unoptimized
                        className={motionStyles.closedArtworkImage}
                      />
                    )}
                  </div>
                  <div
                    className={motionStyles.closedAcrylic}
                    aria-hidden="true"
                  >
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipTopLeft}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipTopRight}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomLeft}`}
                    />
                    <span
                      className={`${motionStyles.closedClip} ${motionStyles.closedClipBottomRight}`}
                    />
                  </div>
                </div>
                <div className={motionStyles.closedSpine} aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </section>
            </div>

            <div
              className={`${motionStyles.caseSpread} ${isCaseOpen ? motionStyles.caseSpreadOpen : ""}`}
              aria-hidden={!isCaseOpen}
            >
              <section
                className={`${styles.leftLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: leftTransform }}
                aria-label="Portada y lista de canciones"
              >
                <div
                  className={`${styles.paperbackPanel} ${denseTracklist ? densityStyles.paperbackPanelDense : ""}`}
                >
                  <div className={styles.coverPanel}>
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt={album.name}
                        fill
                        unoptimized
                        className={styles.cover}
                      />
                    )}
                    <span className={styles.coverGlare} aria-hidden="true" />
                  </div>

                  <div className={styles.trackPanel}>
                    <ul
                      className={`${styles.tracklist} ${denseTracklist ? densityStyles.trackGridDense : ""}`}
                      style={
                        denseTracklist
                          ? ({ "--track-rows": trackRows } as CSSProperties)
                          : undefined
                      }
                    >
                      {loading && (
                        <li className={`${styles.trackRow} ${densityStyles.loadingRow}`}>LEYENDO TOC...</li>
                      )}
                      {!loading &&
                        tracks?.map((t, i) => (
                          <li
                            key={`${t.name}-${i}`}
                            className={
                              denseTracklist
                                ? densityStyles.trackRowDense
                                : styles.trackRow
                            }
                          >
                            <span
                              className={
                                denseTracklist
                                  ? densityStyles.trackIndexDense
                                  : styles.trackIndex
                              }
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span
                              className={
                                denseTracklist
                                  ? densityStyles.trackNameDense
                                  : styles.trackName
                              }
                            >
                              {t.name}
                            </span>
                            {!denseTracklist && (
                              <span className={styles.trackDuration}>
                                {fmt(t.duration_ms)}
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className={motionStyles.leftLeafCloseHitArea}
                    onClick={handleCloseCase}
                    aria-label="Cerrar caja de CD"
                    tabIndex={isCaseOpen ? 0 : -1}
                  />
                </div>
              </section>

              <section
                className={`${styles.rightLeaf} ${motionStyles.motionLeaf}`}
                style={{ transform: rightTransform }}
                aria-label="Disco"
              >
                <div className={styles.tray}>
                  <div className={styles.trayTexture} aria-hidden="true" />
                  <div className={styles.trayHub} aria-hidden="true">
                    <span />
                  </div>
                  <div className={styles.trayClips} aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div
                    ref={discRef}
                    className={[styles.disc, motionStyles.motionDisc, isDiscDragging ? styles.discIsDragging : "", isLaunching ? styles.discLaunchHidden : ""].filter(Boolean).join(" ")}
                    role="slider"
                    tabIndex={isCaseOpen ? 0 : -1}
                    aria-label="Girar CD"
                    aria-valuemin={-180}
                    aria-valuemax={180}
                    aria-valuenow={Math.round(discDragRotation)}
                    {...discPointerHandlers}
                    aria-hidden="true"
                    style={{
                      transform: isCaseOpen
                        ? `translateZ(10px) rotate(calc(-45deg + ${discDragRotation}deg))`
                        : discTransform,
                      opacity: isCaseOpen && !isLaunching ? 1 : 0,
                    }}
                  >
                    {coverUrl && (
                      <Image
                        src={coverUrl}
                        alt=""
                        fill
                        unoptimized
                        className={styles.discArt}
                      />
                    )}
                    <span className={styles.discSheen} aria-hidden="true" />
                    <span className={styles.discRing} aria-hidden="true" />
                    <span className={styles.discHub} aria-hidden="true" />
                  </div>
                  <div
                    className={`${styles.discGrabSurface} ${isDiscDragging ? styles.discGrabSurfaceActive : ""}`}
                    role="slider"
                    tabIndex={isCaseOpen ? 0 : -1}
                    aria-label="Girar CD"
                    aria-valuemin={-180}
                    aria-valuemax={180}
                    aria-valuenow={Math.round(discDragRotation)}
                    {...discPointerHandlers}
                  />
                </div>
              </section>
            </div>

            <div
              className={`${styles.hinge} ${
                isCaseOpen ? styles.hingeOpen : styles.hingeClosed
              }`}
              aria-hidden="true"
            >
              <span />
              <span />
              <span />
            </div>
            <div className={styles.acrylicReflection} aria-hidden="true" />
          </div>
        </div>

        {isLaunching && launchOrigin && (
          <div className={styles.launchDiscLayer} aria-hidden="true">
            <div
              ref={launchDiscRef}
              className={[styles.launchDisc, isLifting ? styles.launchDiscLifting : ""].filter(Boolean).join(" ")}
            >
              <div className={styles.launchDiscHalo} />
              <div ref={launchSpinnerRef} className={styles.launchDiscSpinner}>
                {coverUrl && (
                  <Image
                    src={coverUrl}
                    alt=""
                    fill
                    unoptimized
                    className={styles.launchDiscArt}
                  />
                )}
                <span className={styles.launchDiscSheen} />
                <span className={styles.launchDiscRing} />
                <span className={styles.launchDiscHub} />
              </div>
            </div>
          </div>
        )}

        <footer className={[styles.actions, polishStyles.vfdFooter].join(" ")}>
          <button
            type="button"
            className={polishStyles.vfdMainAction}
            onClick={handlePlay}
            disabled={isLaunching || isPlayPending || isOpeningForPlay}
            aria-busy={isPlayPending || isOpeningForPlay}
            aria-label={`Reproducir ${album.name}`}
          >
            <span className={polishStyles.vfdMainInfo}>
              <strong>{album.name}</strong>
              <small>{album.artists.map((a) => a.name).join(", ")}</small>
            </span>
            <span className={polishStyles.vfdMainHover}>
              {isOpeningForPlay
                ? "ESPERANDO A SPOTIFY..."
                : "REPRODUCIR CD"}
            </span>
          </button>

          <div className={polishStyles.hardwareControls}>
            <button
              type="button"
              className={`${polishStyles.hwBtn} ${polishStyles.hwBtnTray}`}
              onClick={() =>
                !isLaunching && !isPlayPending && !isOpeningForPlay && onClose()
              }
              disabled={isLaunching || isPlayPending || isOpeningForPlay}
              aria-label="Dejar en batea"
            >
              DEJAR EN BATEA
            </button>
            <button
              type="button"
              className={`${polishStyles.hwBtn} ${polishStyles.hwBtnCase}`}
              onClick={() =>
                !isLaunching &&
                !isPlayPending &&
                !isOpeningForPlay &&
                setIsCaseOpen((open) => !open)
              }
              disabled={isLaunching || isPlayPending || isOpeningForPlay}
              aria-expanded={isCaseOpen}
              aria-label={isCaseOpen ? "Cerrar caja" : "Abrir caja"}
            >
              {isCaseOpen ? "CERRAR CAJA" : "ABRIR CAJA"}
            </button>
          </div>
        </footer>
        {playError && (
          <p className={styles.playError} role="alert" aria-live="polite">
            {playError}
          </p>
        )}
      </div>
    </div>
  );
}
