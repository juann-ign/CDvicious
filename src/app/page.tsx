"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { ProgressBar } from "@/components/ProgressBar";
import { StoreSearch } from "@/components/StoreSearch";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  const { data, error } = useNowPlaying(authenticated === true);
  const coverUrl = data?.track?.album.images[0]?.url;
  const accentColor = useDominantColor(coverUrl) ?? "#1DB954";

  const stageStyle = { "--accent-color": accentColor } as CSSProperties;

  return (
    <main className="stage" style={stageStyle}>
      <div className="brand-corner">
        CD<span>vicious</span>
      </div>

      <UserProfileChip />
      <StoreSearch />

      <Disc
        track={data?.track ?? null}
        isPlaying={data?.isPlaying ?? false}
        accentColor={accentColor}
      />

      <div className="now-playing-dock">
        <NowPlayingCard
          track={data?.track ?? null}
          isPlaying={data?.isPlaying ?? false}
          error={error}
        />
        <ProgressBar
          progressMs={data?.progressMs ?? null}
          durationMs={data?.durationMs ?? null}
          isPlaying={data?.isPlaying ?? false}
        />
      </div>
    </main>
  );
}
