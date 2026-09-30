"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import pageStyles from "@/app/page.module.css";
import styles from "./DeckPinnedLayer.module.css";

export function DeckPinnedLayer() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [deckInteractive, setDeckInteractive] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    const overlay = document.querySelector<HTMLElement>("[data-rail-overlay]");
    const railRoot = overlay?.closest<HTMLElement>("[data-deck-interactive]");

    if (!railRoot) return;

    const update = () => {
      setDeckInteractive(railRoot.dataset.deckInteractive !== "false");
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(railRoot, { attributes: true, attributeFilter: ["data-deck-interactive"] });

    return () => observer.disconnect();
  }, []);

  const { data, error } = useNowPlaying(authenticated === true && deckInteractive);
  const coverUrl = data?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";
  const stageStyle = {
    "--accent-color": accentColor,
  } as CSSProperties;

  return (
    <div
      className={styles.layer}
      style={stageStyle}
      data-rail-overlay
    >
      <header className={pageStyles.topControlBar}>
        <div className={pageStyles.brandCorner}>
          CD<span>vicious</span>
        </div>
        <div className={"top-nav-actions " + styles.interactive}>
          <UserProfileChip />
        </div>
      </header>

      <div className={styles.deckCluster}>
        <div className={pageStyles.centerStage}>
          <div className={styles.discHitArea}>
            <Disc
              track={data?.track ?? null}
              isPlaying={data?.isPlaying ?? false}
              accentColor={accentColor}
            />
          </div>
        </div>

        <div className={pageStyles.nowPlayingDock}>
          <div className={styles.interactive}>
            <NowPlayingCard
              track={data?.track ?? null}
              isPlaying={data?.isPlaying ?? false}
              error={error}
              progressMs={data?.progressMs ?? null}
              durationMs={data?.durationMs ?? null}
            />
          </div>
        </div>
      </div>

      {data?.track && (
        <div
          className={styles.bookletLayer + " " + styles.interactive}
          data-rail-booklet
        >
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
