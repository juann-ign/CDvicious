import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";
import { fetchSpotifyWebApi } from "@/lib/spotify";

export async function GET(request: NextRequest) {
  const deviceId = request.nextUrl.searchParams.get("deviceId");
  const headers = { "Cache-Control": "no-store" };
  if (!deviceId || deviceId.length > 512) return NextResponse.json({ error: "invalid_device" }, { status: 400, headers });
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json({ deviceId, volumeSupported: true, transportSupported: true, volume: null, mock: true }, { headers });
  }
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "no_session" }, { status: 401, headers });
  try {
    const response = await fetchSpotifyWebApi(token, "GET /v1/me/player/devices", "https://api.spotify.com/v1/me/player/devices", {
      headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "device_capabilities_unavailable" }, { status: response.status,
      headers: { ...headers, ...(response.headers.get("Retry-After") ? { "Retry-After": response.headers.get("Retry-After")! } : {}) } });
    const body = await response.json() as { devices?: Array<{ id?: string; supports_volume?: boolean; volume_percent?: number | null; is_restricted?: boolean }> };
    const device = body.devices?.find(item => item.id === deviceId);
    if (!device) return NextResponse.json({ error: "device_unavailable" }, { status: 404, headers });
    const volume = typeof device.volume_percent === "number" && Number.isFinite(device.volume_percent) && device.volume_percent >= 0 && device.volume_percent <= 100 ? device.volume_percent / 100 : null;
    return NextResponse.json({ deviceId, volumeSupported: device.supports_volume === true && device.is_restricted !== true,
      transportSupported: device.is_restricted !== true, volume }, { headers });
  } catch { return NextResponse.json({ error: "device_capabilities_unavailable" }, { status: 502, headers }); }
}
