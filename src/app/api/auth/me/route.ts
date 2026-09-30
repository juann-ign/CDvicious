import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession, getValidAccessToken } from "@/lib/session";
import { fetchUserProfile, SpotifyApiError } from "@/lib/spotify";
import type { UserProfile } from "@/types/spotify";

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

type ProfileCacheEntry = {
  profile: UserProfile;
  expiresAt: number;
};

const profileCache = new Map<string, ProfileCacheEntry>();
const profileInFlight = new Map<string, Promise<UserProfile>>();

function cacheKey(accessToken: string) {
  return createHash("sha256").update(accessToken).digest("hex");
}

async function getCachedProfile(accessToken: string, refreshToken: string) {
  const key = cacheKey(refreshToken);
  const cached = profileCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const pending = profileInFlight.get(key);
  if (pending) {
    return pending;
  }

  const request = fetchUserProfile(accessToken).then((profile) => {
    profileCache.set(key, {
      profile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    });
    return profile;
  });

  profileInFlight.set(key, request);

  try {
    return await request;
  } finally {
    profileInFlight.delete(key);
  }
}

export async function GET() {
  const session = await getSession();

  if (!session?.refreshToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const profile = await getCachedProfile(accessToken, session.refreshToken);
    return NextResponse.json(profile, {
      headers: { "Cache-Control": "no-store" },
    });
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
