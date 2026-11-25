"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRailActions } from "@/components/scroll/RailContext";
import { useDiscPlaybackLaunch } from "@/hooks/useDiscPlaybackLaunch";
import { getPlaybackState } from "@/lib/playbackSnapshotCoordinator";
import type { AlbumItem } from "@/types/crate";
import { AlbumDetailPage } from "./AlbumDetailPage";
import { RailFlyingDisc } from "./RailFlyingDisc";
import styles from "./AlbumDetailNavigation.module.css";

type Selection = { album: AlbumItem; origin: HTMLElement; sourceChapter: number; error?: string };
type Actions = {
  openAlbum: (album: AlbumItem, origin: HTMLElement) => void;
  closeAlbum: (restoreFocus?: boolean) => boolean;
  recoverAlbum: (selection: Selection, error: string) => void;
};

const AlbumDetailActions = createContext<Actions | null>(null);
const AlbumDetailSelection = createContext<Selection | null>(null);

export function useAlbumDetailActions() {
  const actions = useContext(AlbumDetailActions);
  if (!actions) throw new Error("Album detail requires its navigation provider");
  return actions;
}

export function AlbumDetailNavigation({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const current = useRef<Selection | null>(null);
  const select = useCallback((next: Selection | null) => {
    current.current = next;
    setSelection(next);
  }, []);
  const openAlbum = useCallback((album: AlbumItem, origin: HTMLElement) => {
    if (current.current || getPlaybackState().busy) return;
    select({ album, origin, sourceChapter: Number(document.documentElement.dataset.chapter ?? 0) });
  }, [select]);
  const closeAlbum = useCallback((restoreFocus = true) => {
    const entry = current.current;
    if (!entry) return false;
    select(null);
    if (restoreFocus) requestAnimationFrame(() => {
      if (current.current) return;
      const origin = entry.origin.isConnected ? entry.origin : [...document.querySelectorAll<HTMLElement>(
        "[data-collection-album-id], [data-batea-album-id], button[data-album-id]",
      )].find((node) => !node.closest("[inert]") &&
        (node.dataset.collectionAlbumId ?? node.dataset.bateaAlbumId ?? node.dataset.albumId) === entry.album.id);
      if (origin && !origin.closest("[inert]")) origin.focus({ preventScroll: true });
    });
    return true;
  }, [select]);
  const recoverAlbum = useCallback((entry: Selection, error: string) => {
    select({ ...entry, error });
  }, [select]);
  const actions = useMemo(() => ({ openAlbum, closeAlbum, recoverAlbum }), [openAlbum, closeAlbum, recoverAlbum]);
  return <AlbumDetailActions.Provider value={actions}>
    <AlbumDetailSelection.Provider value={selection}>{children}</AlbumDetailSelection.Provider>
  </AlbumDetailActions.Provider>;
}

export function AlbumDetailHost() {
  const selection = useContext(AlbumDetailSelection);
  const { closeAlbum, recoverAlbum } = useAlbumDetailActions();
  const { start, stop } = useRailActions();
  const { flight, launch, onArrive, onDone } = useDiscPlaybackLaunch<AlbumItem>();
  const host = useRef<HTMLDivElement>(null);
  const sourceChapter = selection?.sourceChapter;

  useLayoutEffect(() => {
    if (sourceChapter === undefined) return;
    const root = host.current?.closest<HTMLElement>("[data-rail-ready]");
    const rail = root?.querySelector<HTMLElement>("[data-rail-wrapper]");
    if (!root || !rail) return;
    const token = Symbol("album-detail");
    const wasInert = rail.inert;
    rail.inert = true;
    root.dataset.albumDetailOpen = "true";
    root.dataset.albumDetailChapter = String(sourceChapter);
    stop(token);
    return () => {
      rail.inert = wasInert;
      delete root.dataset.albumDetailOpen;
      delete root.dataset.albumDetailChapter;
      start(token);
    };
  }, [sourceChapter, start, stop]);

  return <>
    {selection && <div ref={host} className={styles.host} data-album-detail-host data-lenis-prevent>
      <AlbumDetailPage key={selection.album.id} album={selection.album} initialPlayError={selection.error}
        onClose={() => closeAlbum()} onLoad={() => closeAlbum(false)}
        onPlay={(origin, execution) => launch(selection.album, origin, execution, {
          sourceChapter: selection.sourceChapter,
          onCaptured: () => closeAlbum(false),
          onRecover: (message) => recoverAlbum(selection, message),
        })} />
    </div>}
    {flight && <RailFlyingDisc key={flight.execution.attempt.attemptId} origin={flight.origin}
      execution={flight.execution} onArrive={onArrive} onDone={onDone} />}
  </>;
}
