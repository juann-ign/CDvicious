import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/session";

const RESPONSE_OPTIONS = { headers: { "Cache-Control": "no-store" } };

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json(
      { authenticated: true, accessToken: null },
      RESPONSE_OPTIONS,
    );
  }

  const accessToken = await getValidAccessToken();
  return NextResponse.json(
    { authenticated: !!accessToken, accessToken },
    RESPONSE_OPTIONS,
  );
}
