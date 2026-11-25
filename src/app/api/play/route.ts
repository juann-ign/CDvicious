import { NextResponse } from "next/server";
import { clearSession, getValidAccessToken } from "@/lib/session";
import { fetchSpotifyWebApi } from "@/lib/spotify";

type PlayRequest = {
  uri?: unknown;
  deviceId?: unknown;
  trackPosition?: unknown;
};

function playError(
  error: string,
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    { success: false, error, message },
    { status, headers },
  );
}

export async function POST(request: Request) {
  let body: PlayRequest;

  try {
    const parsed: unknown = await request.json();

    if (typeof parsed !== "object" || parsed === null) {
      return playError(
        "INVALID_REQUEST",
        "La solicitud de reproducción no es válida.",
        400,
      );
    }

    body = parsed as PlayRequest;
  } catch {
    return playError(
      "INVALID_JSON",
      "No se pudo leer la solicitud de reproducción.",
      400,
    );
  }

  const { uri, deviceId, trackPosition } = body;

  if (
    typeof uri !== "string" ||
    uri.trim().length === 0 ||
    typeof deviceId !== "string" ||
    deviceId.trim().length === 0
  ) {
    return playError(
      "MISSING_FIELDS",
      "No se detectó un dispositivo Spotify activo. Abrí Spotify e intentá de nuevo.",
      400,
    );
  }

  const trackJump = trackPosition !== undefined;
  if (trackJump && (typeof trackPosition !== "number" || !Number.isSafeInteger(trackPosition) || trackPosition < 0 ||
    !/^spotify:album:[A-Za-z0-9]{22}$/.test(uri) || deviceId.length > 512)) {
    return playError("INVALID_TRACK_POSITION", "La pista seleccionada no está disponible. Elegí otra.", 400);
  }

  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    // Mock mode confirms the simulated player action without contacting Spotify.
    return NextResponse.json({ success: true, mock: true });
  }

  let accessToken: string | null;

  try {
    // This helper refreshes an expired access token when possible.
    accessToken = await getValidAccessToken();
  } catch {
    return playError(
      "AUTH_REQUIRED",
      "No se pudo validar tu sesión de Spotify. Volvé a iniciar sesión.",
      401,
    );
  }

  if (!accessToken) {
    return playError(
      "AUTH_REQUIRED",
      "Tu sesión de Spotify expiró. Volvé a iniciar sesión.",
      401,
    );
  }

  let response: Response;

  try {
    const endpoint = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`;
    const init: RequestInit = {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(trackJump
        ? { context_uri: uri, offset: { position: trackPosition }, position_ms: 0 }
        : { context_uri: uri }),
    };
    response = trackJump ? await fetchSpotifyWebApi(accessToken, "PUT /v1/me/player/play", endpoint, { ...init, signal: request.signal })
      : await fetch(endpoint, init);
  } catch {
    return playError(
      "SPOTIFY_UNAVAILABLE",
      "No se pudo conectar con Spotify. Revisá tu conexión e intentá de nuevo.",
      502,
    );
  }

  if (response.ok) {
    // Spotify's successful playback endpoint commonly responds with 204 No Content.
    return NextResponse.json({ success: true });
  }

  if (response.status === 401) {
    await clearSession().catch(() => undefined);
    return playError(
      "SPOTIFY_AUTH_EXPIRED",
      "Spotify rechazó la sesión. Volvé a iniciar sesión e intentá de nuevo.",
      401,
    );
  }

  if (response.status === 403) {
    return playError(
      "SPOTIFY_PLAY_FORBIDDEN",
      trackJump ? "Spotify no permitió reproducir esta pista. Verificá tu cuenta y los permisos de reproducción."
        : "Spotify no permitió reproducir este álbum. Verificá tu cuenta y los permisos de reproducción.",
      403,
    );
  }

  if (response.status === 404) {
    return playError(
      "DEVICE_NOT_AVAILABLE",
      "El dispositivo de Spotify ya no está disponible. Seleccioná o activá un dispositivo e intentá otra vez.",
      409,
    );
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");

    return playError(
      "SPOTIFY_RATE_LIMITED",
      "Spotify está limitando las solicitudes. Esperá un momento e intentá de nuevo.",
      429,
      retryAfter ? { "Retry-After": retryAfter } : undefined,
    );
  }

  return playError(
    "SPOTIFY_PLAY_FAILED",
    trackJump ? "Spotify no aceptó la pista seleccionada. Podés intentarlo de nuevo."
      : "Spotify no confirmó la reproducción. No se inició el vuelo; podés intentarlo de nuevo.",
    502,
  );
}
