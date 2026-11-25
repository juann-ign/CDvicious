"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeGenres } from "@/lib/collectionFilters";
import type { ArtistItem } from "@/types/artist";
import styles from "./CollectionChapter.module.css";

export type VerifiedGenre = {
  genre: string;
  matchedArtistIds: string[];
  checkedArtistIds: string[];
  partial: boolean;
};

const SUGGESTED_GENRES = ["rock", "pop", "indie", "jazz", "metal", "electronic"];

export function GenreVerification({ artists, previous, onApply }: {
  artists: readonly Pick<ArtistItem, "id" | "name">[];
  previous: VerifiedGenre | null;
  onApply(result: VerifiedGenre): void;
}) {
  const [input, setInput] = useState(previous?.genre ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const request = useRef<AbortController | null>(null);
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!wait) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  const genre = normalizeGenres([input])[0] ?? "";
  const pendingArtists = (term: string) => {
    const checked = new Set(previous?.genre === term ? previous.checkedArtistIds : []);
    return artists.filter(({ id }) => !checked.has(id));
  };
  const remaining = pendingArtists(genre);

  const verify = async (term: string) => {
    const candidates = pendingArtists(term);
    if (!term || term === "all" || !candidates.length || wait || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/genres/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ genre: term, artists: candidates.slice(0, 24).map(({ id, name }) => ({ id, name })) }),
      });
      const retry = response.headers.get("Retry-After");
      if (retry) {
        const timestamp = /^\d+$/.test(retry) ? Date.now() + Number(retry) * 1000 : Date.parse(retry);
        if (Number.isFinite(timestamp)) { setRetryAt(timestamp); setNow(Date.now()); }
      }
      if (response.status === 429) throw new Error("Spotify limitó las consultas.");
      if (response.status === 401) throw new Error("Volvé a conectar Spotify para comprobar el género.");
      if (response.status === 400) throw new Error("Ingresá un género válido.");
      if (!response.ok) throw new Error("No se pudo comprobar el género en Spotify.");
      const result = await response.json() as VerifiedGenre;
      if (!Array.isArray(result.checkedArtistIds) || !result.checkedArtistIds.length ||
        !Array.isArray(result.matchedArtistIds)) throw new Error("Spotify todavía no devolvió resultados verificables.");
      if (!controller.signal.aborted) {
        onApply(result);
        const status = response.headers.get("X-CDV-Genre-Error-Status");
        if (status === "401") setError("Volvé a conectar Spotify para continuar.");
        if (status === "403") setError("Spotify limitó el acceso a los géneros restantes.");
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No se pudo comprobar el género en Spotify.");
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  };

  const canVerify = !busy && wait === 0;
  const continuing = previous?.genre === genre && remaining.length > 0;
  return <form className={styles.genreVerification} onSubmit={(event) => { event.preventDefault(); void verify(genre); }}>
    <div className={styles.genrePresets} aria-label="Géneros para buscar en Spotify">
      {SUGGESTED_GENRES.map((term) => <button type="button" key={term} className={styles.retryGenres}
        disabled={!canVerify || pendingArtists(term).length === 0}
        onClick={() => { setInput(term); void verify(term); }}>{term}</button>)}
    </div>
    <label className={styles.genreInputLabel}>
      <span>Buscar género en Spotify</span>
      <input className={styles.search} aria-label="Género para comprobar" placeholder="Ej. rock" type="search"
      maxLength={48} value={input} disabled={busy} onChange={(event) => { setInput(event.target.value); setError(""); }} />
    </label>
    <button type="submit" className={styles.retryGenres} disabled={!genre || genre === "all" || !remaining.length || !canVerify}>
      {continuing ? "Consultar más artistas" : "Comprobar género"}
    </button>
    {(busy || wait > 0) && <span role="status">{busy ? "Comprobando género…" : `Reintento disponible en ${wait} s.`}</span>}
    {error && <span role="alert">{error}</span>}
  </form>;
}
