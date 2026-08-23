import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_TOKEN_URL,
  SPOTIFY_SCOPES,
  SPOTIFY_NOW_PLAYING_URL,
} from "./constants";

export function buildAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: SPOTIFY_SCOPES,
    state,
  });
  return `${SPOTIFY_AUTH_URL}?${params.toString()}`;
}

function basicAuthHeader() {
  const raw = `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  });

  if (!res.ok) throw new Error(`spotify token exchange failed: ${res.status}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`spotify token refresh failed: ${res.status}`);
  return res.json() as Promise<{
    access_token: string;
    expires_in: number;
  }>;
}

export async function fetchNowPlaying(accessToken: string) {
  const res = await fetch(SPOTIFY_NOW_PLAYING_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (res.status === 204) {
    return { isPlaying: false, track: null };
  }

  if (res.status === 401) {
    const err = new Error("spotify_unauthorized");
    err.name = "SpotifyUnauthorizedError";
    throw err;
  }

  if (!res.ok) {
    throw new Error(`spotify now-playing failed: ${res.status}`);
  }

  const data = await res.json();

  return {
    isPlaying: Boolean(data.is_playing),
    track: data.item
      ? {
          id: data.item.id,
          name: data.item.name,
          artists: data.item.artists,
          album: data.item.album,
        }
      : null,
  };
}
