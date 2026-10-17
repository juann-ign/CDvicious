"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getClientAuthSession } from "@/lib/clientSession";
import {
  mockSpotifyPlayer,
  type MockSpotifyPlayer,
} from "@/lib/mockSpotifyStore";

type PlaybackPlayer = Spotify.Player | MockSpotifyPlayer;

interface SpotifyPlayerContextType {
  player: PlaybackPlayer | null;
  isReady: boolean;
  deviceId: string | null;
  authenticated: boolean | null;
}

const SpotifyPlayerContext = createContext<SpotifyPlayerContextType>({
  player: null,
  isReady: false,
  deviceId: null,
  authenticated: null,
});

export const useSpotifyPlayer = () => useContext(SpotifyPlayerContext);

export function SpotifyPlayerProvider({ children }: { children: ReactNode }) {
  const mockMode = process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1";
  const [player, setPlayer] = useState<PlaybackPlayer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (mockMode) {
      setAuthenticated(true);
      setToken(null);
      return;
    }

    let active = true;

    getClientAuthSession()
      .then((session) => {
        if (!active) return;

        setAuthenticated(session.authenticated);
        setToken(session.authenticated ? session.accessToken : null);
      })
      .catch(() => {
        if (!active) return;

        setAuthenticated(false);
        setToken(null);
      });

    return () => {
      active = false;
    };
  }, [mockMode]);

  useEffect(() => {
    if (mockMode) {
      setPlayer(mockSpotifyPlayer);
      setDeviceId("cdvicious-mock-device");
      setIsReady(true);

      return () => {
        setPlayer(null);
        setDeviceId(null);
        setIsReady(false);
      };
    }

    if (!token) {
      setPlayer(null);
      setDeviceId(null);
      setIsReady(false);
      return;
    }

    let active = true;
    let spotifyPlayer: Spotify.Player | null = null;

    const handlePlayerStateChanged = () => {
      window.dispatchEvent(new Event("cdvicious:player_state_changed"));
    };

    window.onSpotifyWebPlaybackSDKReady = () => {
      if (!active) return;

      spotifyPlayer = new window.Spotify.Player({
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

      spotifyPlayer.addListener(
        "player_state_changed",
        handlePlayerStateChanged,
      );

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

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      active = false;

      if (spotifyPlayer) {
        spotifyPlayer.removeListener(
          "player_state_changed",
          handlePlayerStateChanged,
        );
        spotifyPlayer.disconnect();
        spotifyPlayer = null;
      }

      setPlayer(null);
      setDeviceId(null);
      setIsReady(false);

      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [token, mockMode]);

  return (
    <SpotifyPlayerContext.Provider
      value={{ player, isReady, deviceId, authenticated }}
    >
      {children}
    </SpotifyPlayerContext.Provider>
  );
}
