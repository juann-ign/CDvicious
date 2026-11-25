"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { AlbumItem } from "@/types/crate";
import { JewelCasePresentation } from "./JewelCasePresentation";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { createDiscPlaybackExecution, type StartPlayExecution } from "@/lib/discPlayback";
import { captureDiscOrigin } from "@/lib/discFlightGeometry";
import { prepareMechanicalDockClick } from "@/lib/mechanicalDockClick";
export type { PlayExecutionResult, StartPlayExecution } from "@/lib/discPlayback";
import styles from "./AlbumDetailPage.module.css";

interface AlbumDetailPageProps {
  album: AlbumItem;
  onClose: () => void;
  onLoad: (originEl: HTMLElement) => void;
  onPlay?: (originEl: HTMLElement, executePlayback: StartPlayExecution) => boolean | void;
  initialPlayError?: string | null;
}

/** The scrollable legacy home has no rail content host. */
export function StandaloneAlbumDetailPage(props: AlbumDetailPageProps) {
  useLayoutEffect(() => {
    const home = document.querySelector<HTMLElement>("main");
    const wasInert = home?.inert;
    const overflow = document.documentElement.style.overflow;
    if (home) home.inert = true;
    document.documentElement.style.overflow = "hidden";
    return () => {
      if (home) home.inert = Boolean(wasInert);
      document.documentElement.style.overflow = overflow;
    };
  }, []);

  return createPortal(<div className={styles.standalone}><AlbumDetailPage {...props} /></div>, document.body);
}

export function AlbumDetailPage({ album, onClose, onLoad, onPlay, initialPlayError = null }: AlbumDetailPageProps) {
  const [isCaseOpen, setIsCaseOpen] = useState(Boolean(initialPlayError));
  const [isPlayPending, setIsPlayPending] = useState(false);
  const [isOpeningForPlay, setIsOpeningForPlay] = useState(false);
  const [playError, setPlayError] = useState<string | null>(initialPlayError);
  const { deviceId, isReady, player } = useSpotifyPlayer();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);
  const discRef = useRef<HTMLDivElement>(null);
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
    (initialErrorRef.current ? playButtonRef.current : closeButtonRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const goBack = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || busyRef.current) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener("keydown", goBack);
    return () => window.removeEventListener("keydown", goBack);
  }, []);

  useEffect(() => {
    setPlayError(initialPlayError);
    if (!initialPlayError) return;
    const frame = requestAnimationFrame(() => playButtonRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [initialPlayError]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK !== "1") return;
    let idle: number | undefined;
    let releaseAudio: (() => void) | undefined;
    const prepare = () => {
      if (!busyRef.current) releaseAudio = prepareMechanicalDockClick();
    };
    // Let the page enter before creating the demo's optional sound context.
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(prepare);
      else prepare();
    }, 360);
    return () => {
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      releaseAudio?.();
    };
  }, []);

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

  const artists = album.artists.map((artist) => artist.name).join(", ");
  const year = album.release_date?.slice(0, 4);
  return (
    <section className={styles.page} aria-label={`${album.name} — ${artists}`} data-testid="album-detail-page"
      data-album-id={album.id} data-lenis-prevent>
      <div className={styles.content}>
        <header className={styles.header}>
          <button type="button" ref={closeButtonRef} className={styles.hardwareButton}
            onClick={() => !busyRef.current && onClose()} disabled={busy}>
            <span aria-hidden="true">←</span> Volver
          </button>
          <div className={styles.heading}>
            <h2 className={styles.title}>{album.name}</h2>
            <p className={styles.artist}>{artists}{year ? ` · ${year}` : ""}</p>
          </div>
        </header>
        <div className={styles.caseStage}>
          <JewelCasePresentation album={album} open={isCaseOpen} onOpen={() => !busyRef.current && setIsCaseOpen(true)}
            onClose={closeCase} onOpened={handleOpened} onClosed={() => { hingeOpenRef.current = false; }}
            disabled={busy} discRef={discRef} />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.hardwareButton}
            onClick={() => !busyRef.current && (isCaseOpen ? closeCase() : setIsCaseOpen(true))}
            disabled={busy} aria-expanded={isCaseOpen}>{isCaseOpen ? "Cerrar caja" : "Abrir caja"}</button>
          <button type="button" ref={playButtonRef} className={styles.playButton} onClick={handlePlay}
            disabled={busy} aria-busy={busy} aria-label={`Reproducir ${album.name}`}>
            <span aria-hidden="true">▶</span>
            {isOpeningForPlay ? "Abriendo caja…" : isPlayPending ? "Esperando a Spotify…" : "Reproducir álbum"}
          </button>
        </div>
        {playError && <p className={styles.playError} role="alert" aria-live="polite">{playError}</p>}
      </div>
    </section>
  );
}
