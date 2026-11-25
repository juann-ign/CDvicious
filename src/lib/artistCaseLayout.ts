import type { ArtistRelease } from "@/types/artist";

function releaseParts(value: string | undefined): number[] | null {
  if (!value) return null;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 0;
  const day = match[3] ? Number(match[3]) : 0;
  if (!year || month > 12 || (match[2] && month < 1) || (match[3] && day < 1)) return null;
  if (day && day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return [year, month, day];
}

/** Compare the edition dates as received, keeping unknown dates after valid ones. */
export function compareArtistEditions(a: Pick<ArtistRelease, "id" | "release_date">, b: Pick<ArtistRelease, "id" | "release_date">) {
  const left = releaseParts(a.release_date);
  const right = releaseParts(b.release_date);
  if (!left || !right) return left ? -1 : right ? 1 : a.id.localeCompare(b.id);
  for (let part = 0; part < 3; part++) if (left[part] !== right[part]) return left[part] - right[part];
  return a.id.localeCompare(b.id);
}
