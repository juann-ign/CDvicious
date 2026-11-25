"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { captureDiscOrigin, type DiscFlightOrigin } from "@/lib/discFlightGeometry";
import type { PlayExecutionResult, StartPlayExecution } from "@/lib/discPlayback";
import type { AlbumItem } from "@/types/crate";

type LaunchCallbacks = {
  sourceChapter?: number;
  onCaptured?: () => void;
  onRecover: (message: string) => void;
};

type DiscLaunch<T extends AlbumItem> = {
  album: T;
  origin: DiscFlightOrigin;
  execution: StartPlayExecution;
};

type ActiveLaunch = {
  execution: StartPlayExecution;
  source: HTMLElement;
  sourceChapter: number;
  callbacks: LaunchCallbacks;
  settled: boolean;
  visualDone: boolean;
};

const CAPTURE_ERROR = "No se pudo medir el CD visible. Volvé a abrir la caja e intentá de nuevo.";

/** Owns the execution lifetime; the flight only measures and presents it. */
export function useDiscPlaybackLaunch<T extends AlbumItem>() {
  const { scrollToChapter } = useRailActions();
  const [flight, setFlight] = useState<DiscLaunch<T> | null>(null);
  const [pending, setPending] = useState(false);
  const activeRef = useRef<ActiveLaunch | null>(null);
  const mounted = useRef(true);
  const frames = useRef(new Set<number>());

  useEffect(() => {
    mounted.current = true;
    const pendingFrames = frames.current;
    return () => {
      mounted.current = false;
      activeRef.current?.execution.cancel();
      activeRef.current = null;
      pendingFrames.forEach(cancelAnimationFrame);
      pendingFrames.clear();
    };
  }, []);

  const nextFrame = useCallback((callback: () => void) => {
    const frame = requestAnimationFrame(() => {
      frames.current.delete(frame);
      if (mounted.current) callback();
    });
    frames.current.add(frame);
  }, []);

  const launch = useCallback((album: T, source: HTMLElement, execution: StartPlayExecution, callbacks: LaunchCallbacks): boolean => {
    if (!mounted.current || activeRef.current) {
      execution.cancel();
      return false;
    }
    // Measure before the album page closes or hides its CD.
    const origin = captureDiscOrigin(source);
    if (!origin) {
      execution.cancel();
      callbacks.onRecover(CAPTURE_ERROR);
      return false;
    }
    const sourceChapter = callbacks.sourceChapter ?? Number(document.documentElement.dataset.chapter ?? "0");
    const current: ActiveLaunch = { execution, source, sourceChapter, callbacks, settled: false, visualDone: false };
    activeRef.current = current;
    setPending(true);
    setFlight({ album, origin, execution });
    callbacks.onCaptured?.();

    const recover = (result: PlayExecutionResult) => {
      if (!mounted.current || activeRef.current !== current) return;
      setFlight(null);
      // Restore the source chapter before the album page acquires its rail lock.
      nextFrame(() => {
        if (activeRef.current !== current) return;
        scrollToChapter(current.sourceChapter, 0);
        current.callbacks.onRecover(result.cancelled
          ? "Carga cancelada. Podés intentarlo de nuevo."
          : result.message ?? "Spotify no confirmó la reproducción. Podés intentarlo de nuevo.");
        setPending(false);
        activeRef.current = null;
        nextFrame(() => {
          if (current.source.isConnected && !current.source.closest("[inert]")) {
            current.source.focus({ preventScroll: true });
          }
        });
      });
    };

    // The caller owns this single invocation. execute itself is idempotent.
    void execution().then((result) => {
      if (!mounted.current || activeRef.current !== current) return;
      current.settled = true;
      if (!result.success) { recover(result); return; }
      if (current.visualDone) {
        activeRef.current = null;
        setPending(false);
      }
    }).catch(() => {
      execution.cancel();
      recover({ success: false, message: "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo." });
    });
    return true;
  }, [nextFrame, scrollToChapter]);

  const onDone = useCallback(() => {
    const current = activeRef.current;
    if (!flight || current?.execution !== flight.execution) return;
    current.visualDone = true;
    setFlight(null);
    if (current.settled) {
      activeRef.current = null;
      setPending(false);
    }
  }, [flight]);
  const onArrive = useCallback(() => undefined, []);

  return { flight, pending, launch, onArrive, onDone };
}
