import { NextResponse } from "next/server";

const LRCLIB_TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");
  const album = searchParams.get("album") || "";
  const duration = searchParams.get("duration") || "";

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Faltan datos del artista o la canción" },
      { status: 400 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LRCLIB_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });

    if (album) params.set("album_name", album);
    if (duration) params.set("duration", duration);

    const exactResponse = await fetch(
      `https://lrclib.net/api/get?${params.toString()}`,
      {
        headers: {
          "User-Agent": "CDvicious (https://github.com)",
        },
        signal: controller.signal,
      },
    );

    if (exactResponse.ok) {
      const data = await exactResponse.json();
      const lyrics =
        data?.plainLyrics ||
        data?.syncedLyrics ||
        "Instrumental o letra no disponible.";

      return NextResponse.json({ lyrics });
    }

    // If the exact match is unavailable, fall back to LRCLIB search.
    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    const searchResponse = await fetch(
      `https://lrclib.net/api/search?q=${searchQuery}`,
      {
        headers: {
          "User-Agent": "CDvicious (https://github.com)",
        },
        signal: controller.signal,
      },
    );

    if (!searchResponse.ok) {
      return NextResponse.json({
        lyrics: "No se pudo conectar con el servidor de letras.",
      });
    }

    const data = await searchResponse.json();

    if (Array.isArray(data) && data.length > 0) {
      const bestMatch = data[0];
      const lyrics =
        bestMatch.plainLyrics ||
        bestMatch.syncedLyrics ||
        "Instrumental o letra no disponible.";
      return NextResponse.json({ lyrics });
    }

    return NextResponse.json({
      lyrics: "No se encontró la letra para esta pista.",
    });
  } catch (error) {
    console.error("Error al obtener la letra:", error);

    if (controller.signal.aborted) {
      return NextResponse.json({
        lyrics: "El servidor de letras tardó demasiado en responder.",
      });
    }

    return NextResponse.json(
      { lyrics: "Error al procesar la letra de la canción." },
      { status: 200 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
