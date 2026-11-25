import type { CatalogPage } from "@/types/artist";
import type { CatalogSearchResult } from "@/types/catalogSearch";

export class CatalogError extends Error {
  constructor(public status: number, public retryAt = 0) {
    super(status === 401 ? "Tu sesión venció. Volvé a conectar Spotify." : status === 429
      ? `Spotify limitó las solicitudes. Esperá ${Math.max(1, Math.ceil((retryAt - Date.now()) / 1000))} s antes de reintentar.`
      : "No se pudo cargar el catálogo. Revisá la conexión e intentá de nuevo.");
  }
}
async function catalogJson(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new CatalogError(response.status, Date.now() + Number(response.headers.get("retry-after") ?? 1) * 1000);
  return response.json();
}

export async function fetchCatalogPage<T>(url: string, signal: AbortSignal): Promise<CatalogPage<T>> {
  const data = await catalogJson(url, signal);
  if (!Array.isArray(data.items) || !(data.nextOffset === null || Number.isSafeInteger(data.nextOffset))) throw new CatalogError(502);
  return data;
}

export async function fetchCatalogSearch(query: string, signal: AbortSignal): Promise<CatalogSearchResult> {
  const params = new URLSearchParams({ scope: "catalog", q: query });
  const data = await catalogJson(`/api/search?${params}`, signal);
  if (!["artist", "album", "mixed", "empty"].includes(data?.kind)
    || !Array.isArray(data.artists) || !Array.isArray(data.albums)) throw new CatalogError(502);
  return data;
}
