import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/spotify";
import { setSession } from "@/lib/session";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("sp_oauth_state")?.value;

  const baseUrl = process.env.APP_URL!;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(`${baseUrl}/?auth_error=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await setSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });

    const response = NextResponse.redirect(baseUrl);
    response.cookies.delete("sp_oauth_state");
    return response;
  } catch {
    return NextResponse.redirect(
      `${baseUrl}/?auth_error=token_exchange_failed`,
    );
  }
}
