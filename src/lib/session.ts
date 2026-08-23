import { cookies } from "next/headers";

const ACCESS_TOKEN_COOKIE = "sp_access_token";
const REFRESH_TOKEN_COOKIE = "sp_refresh_token";
const EXPIRES_AT_COOKIE = "sp_expires_at";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function setSession(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + tokens.expiresIn * 1000;

  cookieStore.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, COOKIE_OPTIONS);
  cookieStore.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30,
  });
  cookieStore.set(EXPIRES_AT_COOKIE, String(expiresAt), COOKIE_OPTIONS);
}

export async function getSession() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
  const expiresAt = cookieStore.get(EXPIRES_AT_COOKIE)?.value;

  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt ? Number(expiresAt) : 0,
    isExpired: expiresAt ? Date.now() > Number(expiresAt) : true,
  };
}

export async function updateAccessToken(
  accessToken: string,
  expiresIn: number,
) {
  const cookieStore = await cookies();
  const expiresAt = Date.now() + expiresIn * 1000;
  cookieStore.set(ACCESS_TOKEN_COOKIE, accessToken, COOKIE_OPTIONS);
  cookieStore.set(EXPIRES_AT_COOKIE, String(expiresAt), COOKIE_OPTIONS);
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(EXPIRES_AT_COOKIE);
}
