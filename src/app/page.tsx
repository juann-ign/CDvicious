"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { CollectionCrate, type CollectionAlbum } from "@/components/CollectionCrate";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";
import styles from "./page.module.css";

function HomeContent() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [isBookletOpen, setIsBookletOpen] = useState(false);
  const [collection, setCollection] = useState<CollectionAlbum[]>([]);
  const searchParams = useSearchParams();
  const albumId = searchParams.get("album");
  const { deviceId, isReady } = useSpotifyPlayer();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  useEffect(() => {
    if (authenticated !== true) return;

    let cancelled = false;
    fetch("/api/collection")
      .then((res) => {
        if (!res.ok) throw new Error("Collection unavailable");
        return res.json();
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setCollection(data);
      })
      .catch(() => {
        if (!cancelled) setCollection([]);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

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
      <header className={styles.topControlBar}>
        <div className={styles.brandCorner}>
          CD<span>vicious</span>
        </div>

        <nav className={styles.topNavActions} aria-label="Main navigation">
          <Link href="/crate" className={styles.crateNavLink}>
            CRATE <span aria-hidden="true">↗</span>
          </Link>
          <UserProfileChip />
        </nav>
      </header>

      <section className={styles.playerSection} aria-label="CD player">
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

        {authenticated === true && collection.length > 0 && (
          <Link href="#crate" className={styles.cratePeek} aria-label="Scroll to The Crate">
            <span>OPEN THE CRATE</span>
            <span aria-hidden="true">↓</span>
          </Link>
        )}
      </section>

      {authenticated === true && collection.length > 0 && (
        <section className={styles.collectionSection}>
          <CollectionCrate albums={collection} totalCount={collection.length} />
        </section>
      )}
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
