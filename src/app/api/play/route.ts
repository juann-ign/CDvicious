import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";

export async function POST(request: Request) {
  const accessToken = await getValidAccessToken();
  const { uri, deviceId } = await request.json();

  if (!accessToken || !uri || !deviceId) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }

  // Le decimos a la API de Spotify que reproduzca el URI en el dispositivo de CDvicious
  const res = await fetch(
    `https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ context_uri: uri }),
    },
  );

  return NextResponse.json({ success: res.ok });
}
