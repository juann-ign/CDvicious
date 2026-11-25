import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchNowPlaying, SpotifyApiError } from "@/lib/spotify";
import mockCollection from "@/mocks/collection.json";
import { getMockTracks } from "@/mocks/demoCatalog";

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const album = mockCollection[0];
    const track = getMockTracks(album)[0];

    return NextResponse.json(
      {
        isPlaying: true,
        progressMs: 42_000,
        durationMs: track.duration_ms,
        track,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const nowPlaying = await fetchNowPlaying(accessToken);
    return NextResponse.json(nowPlaying, { headers: { "Cache-Control": "no-store" } });
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
