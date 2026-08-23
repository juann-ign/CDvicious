import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthUrl } from "@/lib/spotify";

export async function GET() {
  console.log("REDIRECT_URI en uso:", process.env.SPOTIFY_REDIRECT_URI);
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
