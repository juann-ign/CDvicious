export const RAIL_CHAPTERS = ["deck", "split", "batea", "collection", "mixtape"] as const;
export const AUTH_RETURN_COOKIE = "sp_oauth_return";
export const SIGNED_IN_TAB_KEY = "cdvicious:signed-in-tab";

export function chapterIndex(value: string | null): number | null {
  if (value === null) return null;
  const named = RAIL_CHAPTERS.indexOf(value as typeof RAIL_CHAPTERS[number]);
  if (named >= 0) return named;
  return /^[0-4]$/.test(value) ? Number(value) : null;
}

/** A single navigation intent, independent of authentication refresh/playback. */
export function initialChapter(params: URLSearchParams): number | null {
  const destination = chapterIndex(params.get("chapter"));
  return destination ?? (params.get("entry") === "collection" ? 3 : null);
}

/** OAuth accepts only this app's root and a known chapter, never an external URL. */
export function safeAuthReturn(value: string | null, origin: string): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const target = new URL(value, origin);
    if (target.origin !== new URL(origin).origin || target.pathname !== "/") return null;
    const chapter = chapterIndex(target.searchParams.get("chapter"));
    return chapter === null ? null : `/?chapter=${chapter}`;
  } catch {
    return null;
  }
}
