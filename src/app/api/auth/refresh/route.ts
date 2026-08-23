import { NextResponse } from "next/server";
import { getSession, updateAccessToken, clearSession } from "@/lib/session";
import { refreshAccessToken } from "@/lib/spotify";

export async function POST() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "no_session" }, { status: 401 });
  }

  try {
    const refreshed = await refreshAccessToken(session.refreshToken);
    await updateAccessToken(refreshed.access_token, refreshed.expires_in);
    return NextResponse.json({ ok: true });
  } catch {
    await clearSession();
    return NextResponse.json({ error: "refresh_failed" }, { status: 401 });
  }
}
