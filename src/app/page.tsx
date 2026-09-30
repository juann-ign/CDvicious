"use client";

import { useEffect, type CSSProperties, Suspense, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { CrateTeaser } from "@/components/crate/CrateTeaser";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import { HorizontalRail } from "@/components/scroll/HorizontalRail";
import type { AlbumItem } from "@/types/crate";
import styles from "./page.module.css";

const RAIL_ENABLED = process.env.NEXT_PUBLIC_ENABLE_RAIL === "1";

function HomeContent() {
  const { deviceId, isReady, authenticated } = useSpotifyPlayer();
  const [isBookletOpen, setIsBookletOpen] = useState(false);
  const searchParams = useSearchParams();
  const albumId = searchParams.get("album");

  useEffect(() => {
    if (!albumId || !deviceId || !isReady || authenticated !== true) return;
    const albumUri = albumId.startsWith("spotify:album:")
      ? albumId
      : `spotify:album:${albumId}`;

    void fetch("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: albumUri, deviceId }),
    }).catch((error) => {
      console.error("Error al iniciar reproducción:", error);
    });
  }, [albumId, deviceId, isReady, authenticated]);

  const handleLoadAlbumFromCrate = useCallback(
    (album: AlbumItem) => {
      if (!deviceId || !isReady) return;

      void fetch("/api/play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uri: album.uri, deviceId }),
      }).catch((error) => {
        console.error("Error al iniciar reproducción:", error);
      });
    },
    [deviceId, isReady],
  );

  const { data, error } = useNowPlaying(
    authenticated === true && !RAIL_ENABLED,
  );
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
          {!RAIL_ENABLED && <UserProfileChip />}
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

      {!RAIL_ENABLED && (
        <CrateTeaser onLoadAlbum={handleLoadAlbumFromCrate} />
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      {RAIL_ENABLED ? (
        <HorizontalRail fallback={<HomeContent />} />
      ) : (
        <HomeContent />
      )}
    </Suspense>
  );
}
