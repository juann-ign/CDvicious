import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Faltan datos del artista o la canción" },
      { status: 400 },
    );
  }

  try {
    const searchQuery = encodeURIComponent(`${title} ${artist}`);
    const url = `https://lrclib.net/api/search?q=${searchQuery}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "CDvicious (https://github.com)",
      },
    });

    if (!response.ok) {
      return NextResponse.json({
        lyrics: "No se pudo conectar con el servidor de letras.",
      });
    }

    const data = await response.json();

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
    return NextResponse.json(
      { lyrics: "Error al procesar la letra de la canción." },
      { status: 200 },
    );
  }
}
