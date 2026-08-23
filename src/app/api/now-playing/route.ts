import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchNowPlaying } from "@/lib/spotify";

export async function GET() {
  const accessToken = await getValidAccessToken();

  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const nowPlaying = await fetchNowPlaying(accessToken);
    return NextResponse.json(nowPlaying);
  } catch {
    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }
}
