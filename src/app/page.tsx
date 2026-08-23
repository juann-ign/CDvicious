"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@/components/ConnectButton";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { useNowPlaying } from "@/hooks/useNowPlaying";

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  const { data, error } = useNowPlaying(authenticated === true);

  return (
    <main className="stage">
      <div className="brand">
        CD<span>vicious</span>
      </div>

      <Disc track={data?.track ?? null} isPlaying={data?.isPlaying ?? false} />

      <NowPlayingCard
        track={data?.track ?? null}
        isPlaying={data?.isPlaying ?? false}
        error={error}
      />

      <ConnectButton />
    </main>
  );
}
