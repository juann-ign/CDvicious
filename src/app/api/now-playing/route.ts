import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchNowPlaying, SpotifyApiError } from "@/lib/spotify";
import mockCollection from "@/mocks/collection.json";

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    const album = mockCollection[0];

    return NextResponse.json(
      {
        isPlaying: true,
        progressMs: 42_000,
        durationMs: 150_000,
        track: {
          id: `mock-track-${album.id}-1`,
          name: "DEMO TRACK 01",
          duration_ms: 150_000,
          artists: album.artists.map((artist) => ({ name: artist.name })),
          album: {
            name: album.name,
            images: album.images.map((image) => ({
              url: image.url,
              width: image.width,
              height: image.height,
            })),
          },
        },
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
