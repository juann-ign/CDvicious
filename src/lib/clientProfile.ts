"use client";

import type { UserProfile } from "@/types/spotify";

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

function parseRetryAfterSeconds(value: string | null) {
  if (value === null || !/^\d+$/.test(value.trim())) {
    return undefined;
  }

  return Number(value);
}

type ProfileCacheEntry = {
  profile: UserProfile;
  expiresAt: number;
};

export class ClientProfileError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly reason?: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "ClientProfileError";
  }
}

let cachedProfile: ProfileCacheEntry | null = null;
let profilePromise: Promise<UserProfile> | null = null;

export function getClientUserProfile(): Promise<UserProfile> {
  if (cachedProfile && cachedProfile.expiresAt > Date.now()) {
    return Promise.resolve(cachedProfile.profile);
  }

  if (profilePromise) {
    return profilePromise;
  }

  profilePromise = fetch("/api/auth/me", {
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          reason?: string;
        } | null;
        const retryAfter = parseRetryAfterSeconds(
          res.headers.get("retry-after"),
        );
        const validRetryAfter =
          retryAfter !== undefined &&
          Number.isFinite(retryAfter) &&
          retryAfter > 0
            ? retryAfter
            : undefined;

        throw new ClientProfileError(
          `auth/me failed: ${res.status}`,
          res.status,
          body?.reason,
          validRetryAfter,
        );
      }

      const profile = (await res.json()) as UserProfile;
      cachedProfile = {
        profile,
        expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
      };
      return profile;
    })
    .finally(() => {
      profilePromise = null;
    });

  return profilePromise;
}
