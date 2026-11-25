import { NextResponse } from "next/server";
import { getValidAccessToken } from "./session";
import { fetchSpotifyWebApi } from "./spotify";

// Current Spotify maximum for Search and Artist Albums.
export const CATALOG_PAGE_SIZE = 10;
export function catalogOffset(value: string | null, maximum = Number.MAX_SAFE_INTEGER) {
  const offset = Number(value ?? 0);
  return Number.isSafeInteger(offset) && offset >= 0 && offset <= maximum ? offset : null;
}
export async function catalogRequest(path: string, endpoint: string, signal: AbortSignal) {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  // Spotify applies the account country when using a user access token.
  const response = await fetchSpotifyWebApi(token, endpoint, `https://api.spotify.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    return NextResponse.json({ error: response.status === 429 ? "RATE_LIMITED" : "SPOTIFY_ERROR", reason: body?.error?.reason }, {
      status: response.status,
      headers: response.headers.has("retry-after") ? { "Retry-After": response.headers.get("retry-after")! } : undefined,
    });
  }
  return response.json();
}
export function nextCatalogOffset(page: { next?: string | null; offset: number; limit: number }) {
  return page.next ? page.offset + page.limit : null;
}
