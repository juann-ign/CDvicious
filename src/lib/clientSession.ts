"use client";

export type ClientAuthSession = {
  authenticated: boolean;
  accessToken: string | null;
};

let cachedSession: ClientAuthSession | null = null;
let sessionPromise: Promise<ClientAuthSession> | null = null;

export function getClientAuthSession(
  options: { refresh?: boolean } = {},
): Promise<ClientAuthSession> {
  if (sessionPromise) {
    return sessionPromise;
  }

  if (cachedSession && !options.refresh) {
    return Promise.resolve(cachedSession);
  }

  sessionPromise = fetch("/api/auth/session", {
    cache: "no-store",
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new Error(`auth session failed: ${res.status}`);
      }

      const data = (await res.json()) as ClientAuthSession;
      const session = {
        authenticated: Boolean(data.authenticated),
        accessToken: data.accessToken ?? null,
      };

      cachedSession = session;
      return session;
    })
    .catch((error: unknown) => {
      cachedSession = null;
      throw error;
    })
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}
