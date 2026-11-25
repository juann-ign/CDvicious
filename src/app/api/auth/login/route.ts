import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl } from "@/lib/spotify";

export async function GET() {
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

  return response;
}
