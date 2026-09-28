"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useRail } from "./RailContext";
import pageStyles from "@/app/page.module.css";
import styles from "./DeckPinnedLayer.module.css";

export function DeckPinnedLayer() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const { splitProgress } = useRail();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  const { data, error } = useNowPlaying(authenticated === true);
  const coverUrl = data?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";
  const stageStyle = {
    "--accent-color": accentColor,
    "--pSplit": splitProgress,
  } as CSSProperties;

  return (
    <div className={styles.layer} style={stageStyle}>
      <header className={pageStyles.topControlBar + " " + styles.interactive}>
        <div className={pageStyles.brandCorner}>
          CD<span>vicious</span>
        </div>
        <div className="top-nav-actions">
          <UserProfileChip />
        </div>
      </header>

      <div className={styles.deckCluster}>
        <div className={pageStyles.centerStage}>
          <div className={pageStyles.discHero + " " + styles.interactive}>
            <Disc
              track={data?.track ?? null}
              isPlaying={data?.isPlaying ?? false}
              accentColor={accentColor}
            />
          </div>
        </div>

        <div className={pageStyles.nowPlayingDock + " " + styles.interactive}>
          <NowPlayingCard
            track={data?.track ?? null}
            isPlaying={data?.isPlaying ?? false}
            error={error}
            progressMs={data?.progressMs ?? null}
            durationMs={data?.durationMs ?? null}
          />
        </div>
      </div>

      {data?.track && (
        <div className={styles.bookletLayer + " " + styles.interactive}>
          <LyricsBooklet
            track={data.track}
            isOpen
            onToggle={() => undefined}
            accentColor={accentColor}
            showTab={false}
          />
        </div>
      )}
    </div>
  );
}
