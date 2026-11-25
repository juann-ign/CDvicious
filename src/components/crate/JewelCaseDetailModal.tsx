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
import type { AlbumItem } from "@/types/crate";
import { JewelCasePresentation } from "./JewelCasePresentation";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { createDiscPlaybackExecution } from "@/lib/discPlayback";
import { RailContext } from "@/components/scroll/RailContext";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";

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

interface JewelCaseDetailModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
  onPlay?: (originEl: HTMLElement, executePlayback: StartPlayExecution) => void;
  initialPlayError?: string | null;
}

export function JewelCaseDetailModal({
  album,
  onClose,
  onLoad,
  onPlay,
  initialPlayError = null,
}: JewelCaseDetailModalProps) {
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
  const discRef = useRef<HTMLDivElement>(null);
  const launchDiscRef = useRef<HTMLDivElement>(null);
  const launchSpinnerRef = useRef<HTMLDivElement>(null);
  const pendingPlayRef = useRef(false);
  const playStartedRef = useRef(false);
  const launchTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const handedOffRef = useRef(false);
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
      const executePlayback = createDiscPlaybackExecution(album, deviceId, player);
      if (!executePlayback) { playStartedRef.current = false; return; }
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
    album,
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

        <JewelCasePresentation album={album} open={isCaseOpen} onOpen={handleOpenCase} onClose={handleCloseCase} disabled={isLaunching || isPlayPending || isOpeningForPlay} hideDisc={isLaunching} discRef={discRef} />

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
