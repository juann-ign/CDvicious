"use client";

import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AlbumItem } from "@/types/crate";
import { JewelCasePresentation } from "./JewelCasePresentation";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { createDiscPlaybackExecution, type StartPlayExecution } from "@/lib/discPlayback";
import { captureDiscOrigin } from "@/lib/discFlightGeometry";
export type { PlayExecutionResult, StartPlayExecution } from "@/lib/discPlayback";
import { RailContext } from "@/components/scroll/RailContext";
import styles from "./JewelCaseDetailModal.module.css";
import polishStyles from "./JewelCaseDetailModal.polish.module.css";

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

interface JewelCaseDetailModalProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
  onPlay?: (originEl: HTMLElement, executePlayback: StartPlayExecution) => boolean | void;
  initialPlayError?: string | null;
}

export function JewelCaseDetailModal({ album, onClose, onLoad, onPlay, initialPlayError = null }: JewelCaseDetailModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCaseOpen, setIsCaseOpen] = useState(Boolean(initialPlayError));
  const [isPlayPending, setIsPlayPending] = useState(false);
  const [isOpeningForPlay, setIsOpeningForPlay] = useState(false);
  const [playError, setPlayError] = useState<string | null>(initialPlayError);
  const rail = useContext(RailContext);
  const stopRail = rail?.stop;
  const startRail = rail?.start;
  const { deviceId, isReady, player } = useSpotifyPlayer();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
  const railLockTokenRef = useRef(Symbol("jewel-case-modal"));
  const onCloseRef = useRef(onClose);
  const onLoadRef = useRef(onLoad);
  const initialErrorRef = useRef(initialPlayError);
  const busyRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const playStartedRef = useRef(false);
  const hingeOpenRef = useRef(false);
  const mountedRef = useRef(true);
  const fallbackExecution = useRef<StartPlayExecution | null>(null);
  const busy = isPlayPending || isOpeningForPlay;
  onCloseRef.current = onClose;
  onLoadRef.current = onLoad;
  busyRef.current = busy;

  useLayoutEffect(() => {
    const owner = railLockTokenRef.current;
    registerModal(owner, {
      getDialog: () => dialogRef.current,
      isLaunching: () => busyRef.current,
      close: () => onCloseRef.current(),
    });
    return () => unregisterModal(owner);
  }, []);

  useLayoutEffect(() => {
    const token = railLockTokenRef.current;
    stopRail?.(token);
    const previousActive = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      setIsOpen(true);
      (initialErrorRef.current ? playButtonRef.current : closeButtonRef.current)?.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      startRail?.(token);
      const anotherModal = Array.from(activeModalEntries.keys()).some((owner) => owner !== token);
      if (!anotherModal && previousActive?.isConnected) previousActive.focus({ preventScroll: true });
    };
  }, [startRail, stopRail]);

  useEffect(() => {
    setPlayError(initialPlayError);
    if (!initialPlayError) return;
    const frame = requestAnimationFrame(() => playButtonRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [initialPlayError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pendingPlayRef.current = false;
      fallbackExecution.current?.cancel();
    };
  }, []);

  const failPlay = useCallback((message: string) => {
    if (!mountedRef.current) return;
    pendingPlayRef.current = false;
    playStartedRef.current = false;
    busyRef.current = false;
    setIsPlayPending(false);
    setIsOpeningForPlay(false);
    setPlayError(message);
    playButtonRef.current?.focus({ preventScroll: true });
  }, []);

  const beginPlay = useCallback(() => {
    if (playStartedRef.current) return;
    const disc = discRef.current;
    if (!disc || !hingeOpenRef.current) return;
    if (!deviceId || !isReady || !player) {
      failPlay("No hay un dispositivo Spotify activo. Abrí Spotify y esperá a que el reproductor se conecte.");
      return;
    }
    playStartedRef.current = true;
    const execution = createDiscPlaybackExecution(album, deviceId, player);
    if (!execution) {
      failPlay("Ya hay una carga en curso. Esperá a que termine antes de volver a intentar.");
      return;
    }
    setPlayError(null);
    busyRef.current = true;
    setIsPlayPending(true);
    if (onPlay) {
      try {
        // The adapter captures the real CD before it hides or unmounts us.
        if (onPlay(disc, execution) === false) {
          execution.cancel();
          failPlay("No se pudo iniciar la carga del CD. Volvé a abrir la caja e intentá de nuevo.");
        }
      } catch {
        execution.cancel();
        failPlay("No se pudo iniciar la carga del CD. Podés intentarlo de nuevo.");
      }
      return;
    }

    // Legacy consumers share the executor, with a valid visible static source.
    // The three rail origins always supply onPlay and use the measured flight.
    if (!captureDiscOrigin(disc)) {
      execution.cancel();
      failPlay("No se pudo medir el CD visible. Volvé a abrir la caja e intentá de nuevo.");
      return;
    }
    fallbackExecution.current = execution;
    const result = execution();
    execution.markDocked();
    void result.then((response) => {
      if (!mountedRef.current) return;
      if (!response.success) {
        failPlay(response.cancelled ? "Carga cancelada. Podés intentarlo de nuevo." : response.message ?? "Spotify no confirmó la reproducción.");
        return;
      }
      onLoadRef.current(disc);
    }).catch(() => failPlay("No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo."))
      .finally(() => {
        if (fallbackExecution.current === execution) fallbackExecution.current = null;
        if (mountedRef.current) {
          playStartedRef.current = false;
          busyRef.current = false;
          setIsPlayPending(false);
        }
      });
  }, [album, deviceId, failPlay, isReady, onPlay, player]);

  const handlePlay = useCallback(() => {
    if (busyRef.current || playStartedRef.current) return;
    setPlayError(null);
    if (!deviceId || !isReady || !player) {
      failPlay("No hay un dispositivo Spotify activo. Abrí Spotify y esperá a que el reproductor se conecte.");
      return;
    }
    if (!hingeOpenRef.current) {
      pendingPlayRef.current = true;
      busyRef.current = true;
      setIsOpeningForPlay(true);
      setIsCaseOpen(true);
      return;
    }
    beginPlay();
  }, [beginPlay, deviceId, failPlay, isReady, player]);

  const handleOpened = useCallback(() => {
    hingeOpenRef.current = true;
    if (!pendingPlayRef.current) return;
    pendingPlayRef.current = false;
    setIsOpeningForPlay(false);
    beginPlay();
  }, [beginPlay]);

  const closeCase = () => {
    if (busyRef.current) return;
    hingeOpenRef.current = false;
    setIsCaseOpen(false);
  };

  return (
    <div className={styles.overlay} ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
      aria-label={`${album.name} — ${album.artists.map((artist) => artist.name).join(", ")}`}>
      <button type="button" className={styles.scrim} onClick={() => !busyRef.current && onClose()} aria-label="Cerrar" disabled={busy} />
      <div className={[styles.sheet, polishStyles.modalPolish, isOpen ? styles.sheetOpen : ""].filter(Boolean).join(" ")}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>álbum / caja de CD</p>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>{album.artists.map((artist) => artist.name).join(", ")}{album.release_date?.slice(0, 4) ? ` · ${album.release_date.slice(0, 4)}` : ""}</p>
          </div>
          <button type="button" ref={closeButtonRef} className={styles.closeBtn} onClick={() => !busyRef.current && onClose()} disabled={busy} aria-label="Cerrar">
            <span className={polishStyles.closeIcon} aria-hidden="true">×</span>
            <span className={polishStyles.closeLabel}>cerrar</span>
          </button>
        </header>
        <JewelCasePresentation album={album} open={isCaseOpen} onOpen={() => !busyRef.current && setIsCaseOpen(true)}
          onClose={closeCase} onOpened={handleOpened} onClosed={() => { hingeOpenRef.current = false; }}
          disabled={busy} discRef={discRef} />
        <footer className={[styles.actions, polishStyles.vfdFooter].join(" ")}>
          <button type="button" ref={playButtonRef} className={polishStyles.vfdMainAction} onClick={handlePlay}
            disabled={busy} aria-busy={busy} aria-label={`Reproducir ${album.name}`}>
            <span className={polishStyles.vfdMainInfo}><strong>{album.name}</strong><small>{album.artists.map((artist) => artist.name).join(", ")}</small></span>
            <span className={polishStyles.vfdMainHover}>{isOpeningForPlay ? "ABRIENDO CAJA..." : isPlayPending ? "ESPERANDO A SPOTIFY..." : "REPRODUCIR CD"}</span>
          </button>
          <div className={polishStyles.hardwareControls}>
            <button type="button" className={`${polishStyles.hwBtn} ${polishStyles.hwBtnTray}`} onClick={() => !busyRef.current && onClose()} disabled={busy} aria-label="Dejar en batea">DEJAR EN BATEA</button>
            <button type="button" className={`${polishStyles.hwBtn} ${polishStyles.hwBtnCase}`} onClick={() => !busyRef.current && (isCaseOpen ? closeCase() : setIsCaseOpen(true))} disabled={busy} aria-expanded={isCaseOpen} aria-label={isCaseOpen ? "Cerrar caja" : "Abrir caja"}>{isCaseOpen ? "CERRAR CAJA" : "ABRIR CAJA"}</button>
          </div>
        </footer>
        {playError && <p className={styles.playError} role="alert" aria-live="polite">{playError}</p>}
      </div>
    </div>
  );
}
