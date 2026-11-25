import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl } from "@/lib/spotify";
import { AUTH_RETURN_COOKIE, safeAuthReturn } from "@/lib/entryNavigation";

export async function GET(request: NextRequest) {
  const missing = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REDIRECT_URI"]
    .filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    return NextResponse.json({
      error: "SPOTIFY_NOT_CONFIGURED",
      message: "Completá las credenciales de Spotify en .env.local y reiniciá el servidor.",
      missing,
    }, { status: 503 });
  }
  const state = randomBytes(16).toString("hex");
  const authUrl = buildAuthUrl(state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("sp_oauth_state", state, {
    httpOnly: true,
    maxAge: 60 * 5,
    path: "/",
    sameSite: "lax",
  });
  const destination = safeAuthReturn(request.nextUrl.searchParams.get("returnTo"), request.nextUrl.origin);
  response.cookies.set(AUTH_RETURN_COOKIE, destination ?? "/?entry=collection", {
    httpOnly: true,
    maxAge: 60 * 5,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
