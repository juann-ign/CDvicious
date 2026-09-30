import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    return NextResponse.json({
      authenticated: true,
      accessToken: null,
    });
  }

  const session = await getSession();
  return NextResponse.json({
    authenticated: !!session,
    accessToken: session?.accessToken || null,
  });
}
