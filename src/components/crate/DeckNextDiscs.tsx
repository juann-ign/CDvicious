"use client";

import { useEffect, useId, useRef, useState } from "react";
import { bateaAlbums } from "@/lib/bateaAlbums";
import { loadCollection, useCollectionCache } from "@/lib/collectionClient";
import { useAlbumDetailActions } from "./AlbumDetailNavigation";
import { JewelSpine } from "./JewelSpine";
import styles from "./DeckNextDiscs.module.css";

interface Props {
  enabled: boolean;
  authenticated: boolean | null;
  currentAlbumId?: string;
}

export function DeckNextDiscs({ enabled, authenticated, currentAlbumId }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const { openAlbum } = useAlbumDetailActions();
  const { albums, collectionState, collectionError } = useCollectionCache();

  useEffect(() => {
    if (enabled && open && authenticated === true && collectionState === "idle") {
      void loadCollection(authenticated)?.catch(() => undefined);
    }
  }, [enabled, open, authenticated, collectionState]);

  if (!enabled || authenticated !== true) return null;

  const shelf = open ? bateaAlbums(albums ?? []) : [];
  const currentIndex = shelf.findIndex((album) => album.id === currentAlbumId);
  const next = (currentIndex < 0 ? shelf : [...shelf.slice(currentIndex + 1), ...shelf.slice(0, currentIndex)])
    .slice(0, 3);

  return (
    <div className={styles.dock} data-deck-next-discs data-lenis-prevent onKeyDown={(event) => {
      if (!open || event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      toggle.current?.focus({ preventScroll: true });
    }}>
      {open && <section className={styles.shelf} aria-label="Discos guardados para seguir escuchando" id={panelId}>
        {next.length ? next.map((album) => (
          <div className={styles.edition} key={album.id}>
            <JewelSpine albumId={album.id} title={album.name} artist={album.artists.map(({ name }) => name).join(", ")}
              coverUrl={album.images[0]?.url ?? ""} tilt={0} onSelect={(origin) => openAlbum(album, origin)} />
            <span aria-hidden="true" title={album.name}>{album.name}</span>
          </div>
        )) : <p role={collectionState === "error" ? "alert" : "status"}>
          {collectionState === "error" ? collectionError?.message ?? "No se pudieron cargar tus discos."
            : albums ? "No hay más discos guardados." : "Cargando tus discos…"}
        </p>}
      </section>}
      <button ref={toggle} className={styles.toggle} type="button" aria-expanded={open}
        aria-controls={open ? panelId : undefined} onClick={() => setOpen((value) => !value)}>
        Siguiente disco <span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
    </div>
  );
}
