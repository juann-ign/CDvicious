import { NextResponse } from "next/server";
import { getSession, updateAccessToken, clearSession } from "@/lib/session";
import { fetchNowPlaying, refreshAccessToken } from "@/lib/spotify";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  let accessToken = session.accessToken;

  if (session.isExpired) {
    try {
      const refreshed = await refreshAccessToken(session.refreshToken);
      await updateAccessToken(refreshed.access_token, refreshed.expires_in);
      accessToken = refreshed.access_token;
    } catch {
      await clearSession();
      return NextResponse.json({ error: "session_expired" }, { status: 401 });
    }
  }

  try {
    const nowPlaying = await fetchNowPlaying(accessToken);
    return NextResponse.json(nowPlaying);
  } catch (err) {
    if (err instanceof Error && err.name === "SpotifyUnauthorizedError") {
      try {
        const refreshed = await refreshAccessToken(session.refreshToken);
        await updateAccessToken(refreshed.access_token, refreshed.expires_in);
        const nowPlaying = await fetchNowPlaying(refreshed.access_token);
        return NextResponse.json(nowPlaying);
      } catch {
        await clearSession();
        return NextResponse.json({ error: "session_expired" }, { status: 401 });
      }
    }

    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }
}
