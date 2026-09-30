import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  console.log("REDIRECT_URI en uso:", process.env.SPOTIFY_REDIRECT_URI);
  const state = randomBytes(16).toString("hex");
  const force = request.nextUrl.searchParams.get("force") === "1";
  const authUrl = new URL(buildAuthUrl(state));

  if (force) {
    authUrl.searchParams.set("show_dialog", "true");
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("sp_oauth_state", state, {
    httpOnly: true,
    maxAge: 60 * 5,
    path: "/",
    sameSite: "lax",
  });

  return response;
}
