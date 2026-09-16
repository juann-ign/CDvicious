"use client";

import { useEffect, useState, type CSSProperties, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { CrateTeaser } from "@/components/crate/CrateTeaser";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import type { AlbumItem } from "@/types/crate";
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

  const loadAlbumToDeck = useCallback(
    async (uri: string) => {
      if (!deviceId || !isReady) return;
      try {
        await fetch("/api/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri, deviceId }),
        });
      } catch (err) {
        console.error("Error al iniciar reproducción:", err);
      }
    },
    [deviceId, isReady],
  );

  useEffect(() => {
    if (!albumId || !deviceId || !isReady || authenticated !== true) return;
    const albumUri = albumId.startsWith("spotify:album:")
      ? albumId
      : `spotify:album:${albumId}`;
    loadAlbumToDeck(albumUri);
  }, [albumId, deviceId, isReady, authenticated, loadAlbumToDeck]);

  const handleLoadAlbumFromCrate = useCallback(
    (album: AlbumItem) => {
      loadAlbumToDeck(album.uri);
    },
    [loadAlbumToDeck],
  );

  const { data, error } = useNowPlaying(authenticated === true);
  const coverUrl = data?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";

  const stageStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <main className={styles.stageMain} style={stageStyle}>
      <header className={styles.topControlBar}>
        <div className={styles.brandCorner}>
          CD<span>vicious</span>
        </div>
        <div className="top-nav-actions">
          <UserProfileChip />
        </div>
      </header>

      <div className={styles.centerStage}>
        <div className={styles.discHero}>
          <Disc
            track={data?.track ?? null}
            isPlaying={data?.isPlaying ?? false}
            accentColor={accentColor}
          />
        </div>
      </div>

      <div className={styles.nowPlayingDock}>
        <NowPlayingCard
          track={data?.track ?? null}
          isPlaying={data?.isPlaying ?? false}
          error={error}
          progressMs={data?.progressMs ?? null}
          durationMs={data?.durationMs ?? null}
        />
      </div>

      <div className={styles.bookletOverlayLayer}>
        <LyricsBooklet
          track={data?.track ?? null}
          isOpen={isBookletOpen}
          onToggle={() => setIsBookletOpen((open) => !open)}
          accentColor={accentColor}
        />
      </div>

      <CrateTeaser onLoadAlbum={handleLoadAlbumFromCrate} />
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
