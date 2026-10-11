import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession, getValidAccessToken } from "@/lib/session";
import { cached } from "@/lib/serverCache";
import { fetchUserProfile, SpotifyApiError } from "@/lib/spotify";
import type { UserProfile } from "@/types/spotify";

const PROFILE_CACHE_TTL_MS = 15 * 60 * 1000;

function cacheKey(refreshToken: string | undefined, accessToken: string) {
  const identity = refreshToken || accessToken;
  return `auth:profile:${createHash("sha256").update(identity).digest("hex")}`;
}

class NoSessionError extends Error {
  constructor() {
    super("no_session");
    this.name = "NoSessionError";
  }
}

const MOCK_PROFILE = {
  id: "cdvicious-dev",
  display_name: "CDvicious Demo",
  images: [
    {
      url: "https://placehold.co/96x96/111111/ffffff.png?text=DV",
      width: 96,
      height: 96,
    },
  ],
  displayName: "CDvicious Demo",
  avatarUrl: "https://placehold.co/96x96/111111/ffffff.png?text=DV",
};

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json(MOCK_PROFILE, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const key = cacheKey(session.refreshToken, session.accessToken);

  try {
    const profile = await cached<UserProfile>(
      key,
      PROFILE_CACHE_TTL_MS,
      async () => {
        const accessToken = await getValidAccessToken();

        if (!accessToken) {
          throw new NoSessionError();
        }

        return fetchUserProfile(accessToken);
      },
    );

    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof NoSessionError) {
      return NextResponse.json({ error: "no_session" }, { status: 401 });
    }

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
