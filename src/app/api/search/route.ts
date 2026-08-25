import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");
  const session = await getSession();

  if (!session?.accessToken || !q) {
    return NextResponse.json(
      { error: "Faltan parámetros o sesión" },
      { status: 400 },
    );
  }

  // Buscamos solo álbumes, limitando a 10 resultados
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
    },
  );

  const data = await res.json();
  return NextResponse.json(data.albums?.items || []);
}
