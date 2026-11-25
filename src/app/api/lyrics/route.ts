import { NextResponse } from "next/server";
import { lyricsFromRecord, matchesLyricsSignature, selectLyricsRecord } from "@/lib/lyrics";
import type { LyricsResponse } from "@/types/lyrics";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  const album = searchParams.get("album")?.trim() ?? "";
  const rawDuration = searchParams.get("duration");
  const duration = rawDuration === null ? undefined : Number(rawDuration);

  if (!artist || !title || (duration !== undefined && (!Number.isFinite(duration) || duration <= 0))) {
    return NextResponse.json(
      { status: "error", lyrics: null, provenance: { provider: "lrclib" }, error: "Faltan datos válidos del artista, la canción o su duración." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
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
      { status: "available", lyrics: mockLyrics.join("\n"), provenance: { provider: "demo" }, mock: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const signature = { artist, title, album, duration };
  const unavailable: LyricsResponse = { status: "unavailable", lyrics: null, provenance: { provider: "lrclib" } };
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  if (request.signal.aborted) abort();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  const errorResponse = (status: number, message: string, retryAfter?: string | null) => NextResponse.json(
    { status: "error", lyrics: null, provenance: { provider: "lrclib" }, error: message },
    { status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": retryAfter } : {}) } },
  );
  const upstream = async (endpoint: "get" | "search") => {
    const query = new URLSearchParams({ artist_name: artist, track_name: title });
    if (album) query.set("album_name", album);
    // LRCLIB's signature endpoint accepts durations from 1 to 3600 seconds.
    // Longer tracks still require a matching duration in the returned record.
    if (endpoint === "get" && duration !== undefined && duration >= 1 && duration <= 3600) query.set("duration", String(duration));
    return fetch(`https://lrclib.net/api/${endpoint}?${query}`, {
      signal: controller.signal,
      headers: { "User-Agent": "CDvicious/0.1 (https://github.com/juann-ign/CDvicious)" },
      cache: "no-store",
    });
  };
  const failure = (response: Response) => errorResponse(
    response.status === 429 ? 429 : 502,
    response.status === 429 ? "El proveedor de letras está limitando las consultas. Intentá más tarde." : "No se pudo consultar el proveedor de letras.",
    response.headers.get("Retry-After"),
  );
  try {
    const exact = await upstream("get");
    if (!exact.ok && exact.status !== 404) return failure(exact);
    if (exact.ok) {
      const record: unknown = await exact.json();
      if (matchesLyricsSignature(record, signature)) return NextResponse.json(lyricsFromRecord(record, "exact"), { headers: { "Cache-Control": "no-store" } });
    }
    // The fallback uses structured fields and validates every candidate. A
    // provider result's position is never evidence that it is this recording.
    const search = await upstream("search");
    if (!search.ok && search.status !== 404) return failure(search);
    if (search.status === 404) return NextResponse.json(unavailable, { headers: { "Cache-Control": "no-store" } });
    const records: unknown = await search.json();
    if (!Array.isArray(records)) return errorResponse(502, "El proveedor devolvió una respuesta de letras inválida.");
    return NextResponse.json(selectLyricsRecord(records, signature) ?? unavailable, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(controller.signal.aborted ? (request.signal.aborted ? 499 : 504) : 502,
      controller.signal.aborted ? "La consulta de letras se interrumpió. Podés volver a intentarlo." : "No se pudo consultar el proveedor de letras.");
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abort);
  }
}