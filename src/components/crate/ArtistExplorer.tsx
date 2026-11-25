"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { useRailNavigation } from "@/components/scroll/RailContext";
import { useArtistSearch } from "@/hooks/useArtistSearch";
import { useDiscPlaybackLaunch } from "@/hooks/useDiscPlaybackLaunch";
import { createDiscPlaybackExecution } from "@/lib/discPlayback";
import { ArtistDiscographyView } from "./ArtistDiscographyView";
import { RailFlyingDisc } from "./RailFlyingDisc";
import type { ArtistItem, ArtistRelease } from "@/types/artist";
import styles from "./ArtistDiscography.module.css";

export function ArtistExplorer({ open, active, onCollection }: { open: boolean; active: boolean; onCollection: () => void }) {
  const [artist, setArtist] = useState<ArtistItem | null>(null);
  const [showResults, setShowResults] = useState(true);
  const resultButtons = useRef(new Map<string, HTMLButtonElement>());
  const chosenArtist = useRef<string | null>(null);
  const previousResults = useRef(true);
  const search = useArtistSearch(open && showResults && active);
  const { player, deviceId, isReady } = useSpotifyPlayer();
  const { activeChapterIndex } = useRailNavigation();
  const { flight, pending, launch, onArrive, onDone } = useDiscPlaybackLaunch<ArtistRelease>();
  const [playError, setPlayError] = useState<string | null>(null);
  const flyingId = flight?.album.id;
  useEffect(() => {
    const returning = showResults && !previousResults.current;
    previousResults.current = showResults;
    if (!returning || !open || !chosenArtist.current) return;
    const frame = requestAnimationFrame(() => resultButtons.current.get(chosenArtist.current!)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showResults, open]);
  const play = (album: ArtistRelease, origin: HTMLElement) => {
    if (pending) return;
    if (!player || !deviceId || !isReady) { setPlayError("No hay un dispositivo Spotify activo. Conectá Spotify e intentá de nuevo."); return; }
    const execution = createDiscPlaybackExecution(album, deviceId, player);
    if (execution) launch(album, origin, execution, {
      onCaptured: () => setPlayError(null),
      onRecover: setPlayError,
    });
  };
  return <div className={styles.explorer} hidden={!open}>
    <div className={styles.searchView} hidden={!showResults}>
      <div className={styles.breadcrumb}><button onClick={onCollection}>← TU COLECCIÓN</button></div>
      <span className={styles.eyebrow}>COLECCIÓN / CATÁLOGO DE ARTISTAS</span>
      <h2>Buscar artista</h2>
      <p>Buscá un artista. Elegí un resultado para entrar en su discografía.</p>
      <label className={styles.searchLabel}>NOMBRE DEL ARTISTA<input autoComplete="off" type="search" aria-label="Buscar artistas" placeholder="ESCRIBÍ UN NOMBRE…" value={search.query} onChange={(event) => search.changeQuery(event.target.value)} /></label>
      {search.loading && search.query.trim() && <p role="status">BUSCANDO ARTISTAS…</p>}
      {search.error && <div className={styles.error} role="alert">{search.error.message} <button onClick={search.retry}>REINTENTAR</button>{search.error.status === 401 && <a href="/api/auth/login">CONECTAR SPOTIFY</a>}</div>}
      {!search.loading && !search.error && search.result && <>
        <div className={styles.results} aria-label="Resultados de artistas">{search.result.items.map((item) => <button key={item.id} ref={(node) => { if (node) resultButtons.current.set(item.id, node); else resultButtons.current.delete(item.id); }} onClick={() => { chosenArtist.current = item.id; setArtist(item); setShowResults(false); setPlayError(null); }}><span className={styles.resultImage}>{item.images[0] ? <Image src={item.images[0].url} alt="" width={46} height={46} unoptimized /> : "ART"}</span><span>{item.name}<small>EXPLORAR DISCOGRAFÍA</small></span><span>↗</span></button>)}</div>
        {!search.result.items.length && <p role="status">SIN ARTISTAS PARA ESTA CONSULTA</p>}
        {(search.offset > 0 || search.result.nextOffset !== null) && <div className={styles.searchPagination}><button disabled={search.offset === 0} onClick={() => search.changePage(Math.max(0, search.offset - 10))}>Anterior</button><span>Página {Math.floor(search.offset / 10) + 1}</span><button disabled={search.result.nextOffset === null} onClick={() => search.changePage(search.result!.nextOffset!)}>Siguiente</button></div>}
      </>}
      {process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1" ? <p className={styles.sourceNote}>MODO DEMO · PROBÁ VÉRTICE, SATÉLITE O THE BEATLES. LOS LANZAMIENTOS SON FICTICIOS.</p> : <a className={styles.spotifyLink} href="https://open.spotify.com" target="_blank" rel="noreferrer"><Image src="/images/spotify-logo.svg" alt="Spotify" width={72} height={22} />ABRIR SPOTIFY ↗</a>}
    </div>
    {artist && <div className={styles.catalogView} hidden={showResults}><ArtistDiscographyView artist={artist} active={open && activeChapterIndex === 3 && !showResults} settled={active} onResults={() => setShowResults(true)} onCollection={onCollection} onPlay={play} pending={pending} hiddenDiscId={flyingId} playError={playError} /></div>}
    {flight && <RailFlyingDisc key={flight.execution.attempt.attemptId} origin={flight.origin} execution={flight.execution} onArrive={onArrive} onDone={onDone} />}
  </div>;
}
