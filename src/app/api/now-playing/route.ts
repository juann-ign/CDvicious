import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchNowPlaying, SpotifyApiError } from "@/lib/spotify";

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json({
      isPlaying: true,
      progressMs: 42_000,
      durationMs: 214_000,
      track: {
        id: "cdvicious-demo-track",
        name: "Demo Track",
        duration_ms: 214_000,
        artists: [{ name: "CDvicious Demo" }],
        album: {
          name: "Local Mock Session",
          images: [
            {
              url: "https://placehold.co/600x600/111111/ffffff.png?text=NOW",
              width: 600,
              height: 600,
            },
          ],
        },
      },
    });
  }

  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const nowPlaying = await fetchNowPlaying(accessToken);
    return NextResponse.json(nowPlaying);
  } catch (error) {
    if (error instanceof SpotifyApiError) {
      const responseHeaders =
        error.retryAfter !== undefined
          ? { "Retry-After": error.retryAfter }
          : undefined;

      if (error.status === 429) {
        return NextResponse.json(
          {
            error: "spotify_rate_limited",
            status: error.status,
            reason: error.reason ?? "RATE_LIMITED",
          },
          {
            status: 429,
            headers: responseHeaders,
          },
        );
      }

      return NextResponse.json(
        {
          error: "spotify_error",
          status: error.status,
          reason: error.reason ?? null,
        },
        { status: error.status === 401 ? 401 : 502 },
      );
    }

    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }
}
