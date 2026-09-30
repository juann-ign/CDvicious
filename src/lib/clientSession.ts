"use client";

export type ClientAuthSession = {
  authenticated: boolean;
  accessToken: string | null;
};

let cachedSession: ClientAuthSession | null = null;
let sessionPromise: Promise<ClientAuthSession> | null = null;

export function getClientAuthSession(): Promise<ClientAuthSession> {
  if (cachedSession) {
    return Promise.resolve(cachedSession);
  }

  if (sessionPromise) {
    return sessionPromise;
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
    .finally(() => {
      sessionPromise = null;
    });

  return sessionPromise;
}
