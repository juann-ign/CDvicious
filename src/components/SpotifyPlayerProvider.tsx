"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

interface SpotifyPlayerContextType {
  player: Spotify.Player | null;
  isReady: boolean;
  deviceId: string | null;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextType>({
  player: null,
  isReady: false,
  deviceId: null,
});

export const useSpotifyPlayer = () => useContext(SpotifyPlayerContext);

export function SpotifyPlayerProvider({ children }: { children: ReactNode }) {
  const [player, setPlayer] = useState<Spotify.Player | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.accessToken) {
          setToken(data.accessToken);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!token) return;

    // 1. Definimos la función ANTES de cargar el script
    window.onSpotifyWebPlaybackSDKReady = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: "CDvicious Web Player",
        getOAuthToken: (cb) => {
          cb(token);
        },
        volume: 0.5,
      });

      spotifyPlayer.addListener("ready", ({ device_id }) => {
        console.log("🎧 Dispositivo Listo con ID:", device_id);
        setDeviceId(device_id);
        setIsReady(true);
      });

      spotifyPlayer.addListener("not_ready", ({ device_id }) => {
        console.log("❌ Dispositivo desconectado:", device_id);
        setIsReady(false);
      });

      spotifyPlayer.addListener("initialization_error", ({ message }) =>
        console.error(message),
      );
      spotifyPlayer.addListener("authentication_error", ({ message }) =>
        console.error(message),
      );
      spotifyPlayer.addListener("account_error", ({ message }) =>
        console.error(message),
      );

      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
    };

    // 2. Inyectamos el script dinámicamente
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Limpieza si el componente se desmonta
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [token]);

  return (
    <SpotifyPlayerContext.Provider value={{ player, isReady, deviceId }}>
      {children}
    </SpotifyPlayerContext.Provider>
  );
}
