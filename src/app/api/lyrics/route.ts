import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist");
  const title = searchParams.get("title");
  const album = searchParams.get("album");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Faltan datos del artista o la canción" },
      { status: 400 },
    );
  }

  if (process.env.NEXT_PUBLIC_SPOTIFY_MOCK === "1") {
    // Original placeholder text: this path is only for exercising the booklet UI.
    const mockLyrics = [
      "[LETRA FICTICIA / SESIÓN MOCK]",
      `${title.toUpperCase()} — ${artist.toUpperCase()}`,
      album ? `ÁLBUM: ${album.toUpperCase()}` : "",
      "",
      "La ciudad se enciende detrás del cristal,",
      "las antenas dibujan caminos de sal.",
      "Un zumbido azul cruza la habitación,",
      "y la noche sincroniza su respiración.",
      "",
      "Guardo señales dentro de un cajón,",
      "mapas vencidos, ruido y electricidad.",
      "Cada reflejo pregunta quién soy,",
      "cada silencio responde que voy.",
      "",
      "Luces en la ruta, girando al revés,",
      "un pulso mecánico contando hasta tres.",
      "El mundo se mueve sin pedir permiso,",
      "y encuentro tu voz dentro del ruido.",
      "",
      "No hay coordenadas para regresar,",
      "solo una frecuencia que insiste en llamar.",
      "Bajo los cables despierta el color,",
      "un pequeño incendio transforma el motor.",
      "",
      "Cruza la estática, vuelve a empezar,",
      "rompe la línea que marca el final.",
      "Si cae la señal, la vamos a inventar,",
      "con piezas de sueños y polvo lunar.",
      "",
      "Los edificios se empiezan a abrir,",
      "la madrugada aprende a latir.",
      "Una ventana mantiene su luz,",
      "como un faro diminuto en el sur.",
      "",
      "Hay voces lejanas grabadas en cinta,",
      "un tren invisible que nunca termina.",
      "Cada recuerdo rebobina después,",
      "cada nueva vuelta nos cambia la piel.",
      "",
      "Luces en la ruta, girando al revés,",
      "un pulso mecánico contando hasta tres.",
      "El mundo se mueve sin pedir permiso,",
      "y encuentro tu voz dentro del ruido.",
      "",
      "Cuando amanezca no apagues el dial,",
      "queda otra frecuencia por encontrar.",
      "La última página no dice adiós,",
      "solo deja espacio para otra canción.",
      "",
      "[FIN DE LETRA DE PRUEBA]",
    ];

    return NextResponse.json(
      { lyrics: mockLyrics.join("\n"), mock: true },
      { headers: { "Cache-Control": "no-store" } },
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
