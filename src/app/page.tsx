"use client";

import { useEffect, useState, type CSSProperties, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import styles from "./page.module.css";

function HomeContent() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [isBookletOpen, setIsBookletOpen] = useState(false);
  const searchParams = useSearchParams();
  const albumId = searchParams.get("album");
  const { deviceId, isReady } = useSpotifyPlayer();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  useEffect(() => {
    if (!albumId || !deviceId || !isReady || authenticated !== true) return;

    const playSelectedAlbum = async () => {
      try {
        const albumUri = albumId.startsWith("spotify:album:")
          ? albumId
          : `spotify:album:${albumId}`;

        await fetch("/api/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri: albumUri, deviceId }),
        });
      } catch (err) {
        console.error("Error al iniciar reproducción:", err);
      }
    };

    playSelectedAlbum();
  }, [albumId, deviceId, isReady, authenticated]);

  const { data, error } = useNowPlaying(authenticated === true);
  const coverUrl = data?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";

  const stageStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <main className={styles.stageMain} style={stageStyle}>
      {/* HEADER UNIFICADO DE PUNTA A PUNTA */}
      <header className={styles.topControlBar}>
        <div className={styles.brandCorner}>
          CD<span>vicious</span>
        </div>

        <Link href="/crate" className={styles.crateNavLink}>
          <span className={styles.vfdPrompt}>NAV:</span>
          <span className={styles.navLabel}>CRATE / BATEA</span>
        </Link>

        <div className="top-nav-actions">
          <UserProfileChip />
        </div>
      </header>

      {/* ZONA CENTRAL: centra Disc + Booklet a igual distancia de nav y VFD */}
      <div className={styles.centerStage}>
        {/* ESCENARIO BILATERAL SIMÉTRICO */}
        <div
          className={`${styles.mainContentCore} ${isBookletOpen ? styles.isOpen : ""}`}
        >
          {" "}
          <LyricsBooklet
            track={data?.track ?? null}
            isOpen={isBookletOpen}
            onToggle={() => setIsBookletOpen(!isBookletOpen)}
            accentColor={accentColor}
          />
          <Disc
            track={data?.track ?? null}
            isPlaying={data?.isPlaying ?? false}
            accentColor={accentColor}
          />
        </div>
      </div>

      {/* REPRODUCTOR VFD FIJO ABAJO */}
      <div className={styles.nowPlayingDock}>
        <NowPlayingCard
          track={data?.track ?? null}
          isPlaying={data?.isPlaying ?? false}
          error={error}
          progressMs={data?.progressMs ?? null}
          durationMs={data?.durationMs ?? null}
        />
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
