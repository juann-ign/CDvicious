"use client";

import { useEffect, useState, type CSSProperties, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfileChip } from "@/components/UserProfileChip";
import { Disc } from "@/components/Disc";
import { NowPlayingCard } from "@/components/NowPlayingCard";
import { StoreSearch } from "@/components/StoreSearch";
import { LyricsBooklet } from "@/components/LyricsBooklet";
import { useNowPlaying } from "@/hooks/useNowPlaying";
import { useDominantColor } from "@/hooks/useDominantColor";
import { useSpotifyPlayer } from "@/components/SpotifyPlayerProvider";

function HomeContent() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const searchParams = useSearchParams();
  const albumId = searchParams.get("album");
  const { deviceId, isReady } = useSpotifyPlayer();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((d) => setAuthenticated(d.authenticated));
  }, []);

  // Si venimos de la batea con un álbum seleccionado y el reproductor está listo, lo reproducimos
  useEffect(() => {
    if (!albumId || !deviceId || !isReady || authenticated !== true) return;

    // Buscamos el URI del álbum o mandamos la orden de reproducción directa
    const playSelectedAlbum = async () => {
      try {
        // Obtenemos los detalles del álbum o construimos su URI de Spotify
        const albumUri = albumId.startsWith("spotify:album:")
          ? albumId
          : `spotify:album:${albumId}`;

        await fetch("/api/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uri: albumUri, deviceId }),
        });
      } catch (err) {
        console.error("Error al iniciar reproducción del álbum:", err);
      }
    };

    playSelectedAlbum();
  }, [albumId, deviceId, isReady, authenticated]);

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
          progressMs={data?.progressMs ?? null}
          durationMs={data?.durationMs ?? null}
        />
      </div>
      <LyricsBooklet track={data?.track ?? null} />
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
