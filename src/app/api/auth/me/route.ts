import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchUserProfile } from "@/lib/spotify";

export async function GET() {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const profile = await fetchUserProfile(accessToken);
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }
}
