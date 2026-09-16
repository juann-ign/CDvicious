import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";

interface SpotifyTrackItem {
  name: string;
  duration_ms: number;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  const res = await fetch(
    `https://api.spotify.com/v1/albums/${id}/tracks?limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) {
    return NextResponse.json({ error: "spotify_error" }, { status: 502 });
  }

  const data = await res.json();
  const tracks = (data.items ?? []).map((t: SpotifyTrackItem) => ({
    name: t.name,
    duration_ms: t.duration_ms,
  }));

  return NextResponse.json({ tracks });
}
