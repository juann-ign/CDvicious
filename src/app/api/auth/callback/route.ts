import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/spotify";
import { setSession } from "@/lib/session";
import { AUTH_RETURN_COOKIE, safeAuthReturn } from "@/lib/entryNavigation";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("sp_oauth_state")?.value;

  // APP_URL is optional. Prefer the configured OAuth origin because Next's
  // dev server can normalize 127.0.0.1 to localhost, splitting session cookies.
  const homeUrl = new URL("/", process.env.APP_URL?.trim()
    || process.env.SPOTIFY_REDIRECT_URI?.trim() || request.nextUrl.origin);
  const redirectHome = (error?: string) => {
    const destination = safeAuthReturn(request.cookies.get(AUTH_RETURN_COOKIE)?.value ?? null, homeUrl.origin);
    const target = error ? new URL(homeUrl) : new URL(destination ?? "/?entry=collection", homeUrl);
    if (error) target.searchParams.set("auth_error", error);
    const response = NextResponse.redirect(target);
    response.cookies.delete("sp_oauth_state");
    response.cookies.delete(AUTH_RETURN_COOKIE);
    return response;
  };

  if (!code || !state || state !== storedState) {
    return redirectHome("invalid_state");
  }

  let tokens: Awaited<ReturnType<typeof exchangeCodeForTokens>>;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (error) {
    // Report only the HTTP status, never codes, tokens, credentials or bodies.
    const status = error instanceof Error
      ? /^spotify token exchange failed: (\d{3})$/.exec(error.message)?.[1]
      : undefined;
    console.error("[Spotify OAuth] Falló el intercambio de código.", { status: status ?? "unavailable" });
    return redirectHome("token_exchange_failed");
  }

  try {
    await setSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
  } catch {
    console.error("[Spotify OAuth] No se pudo guardar la sesión.");
    return redirectHome("session_failed");
  }
  return redirectHome();
}
