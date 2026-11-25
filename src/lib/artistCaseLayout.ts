import type { ArtistRelease } from "@/types/artist";

/** A release passes the centre every 2.4 seconds; no rail clock is involved. */
export const ARTIST_CYCLE_STEP_MS = 2400;
export const ARTIST_CYCLE_RADIUS = 5;

export function wrapArtistIndex(index: number, count: number) {
  return count > 0 ? ((index % count) + count) % count : 0;
}

export function advanceArtistCycle(phase: number, elapsedMs: number) {
  const total = phase + Math.max(0, elapsedMs) / ARTIST_CYCLE_STEP_MS;
  const steps = Math.floor(total);
  return { phase: total - steps, steps };
}

export interface ArtistCaseSlot { at: number; offset: number; copy: boolean }

/** Copies fill the visible strip, but each edition has one canonical control. */
export function artistCaseSlots(count: number, index: number, cycling: boolean, radius = ARTIST_CYCLE_RADIUS): ArtistCaseSlot[] {
  if (count < 1) return [];
  if (count === 1) return [{ at: 0, offset: 0, copy: false }];
  if (!cycling) {
    return Array.from({ length: Math.min(count, radius * 2 + 1) }, (_, slot) => {
      const start = Math.max(0, Math.min(index - radius, count - radius * 2 - 1));
      const at = start + slot;
      return { at, offset: at - index, copy: false };
    });
  }
  const slots = Array.from({ length: radius * 2 + 1 }, (_, slot) => ({
    at: wrapArtistIndex(index + slot - radius, count), offset: slot - radius,
  }));
  const canonical = new Map<number, number>();
  [...slots].sort((a, b) => Math.abs(a.offset) - Math.abs(b.offset) || a.offset - b.offset)
    .forEach(({ at, offset }) => { if (!canonical.has(at)) canonical.set(at, offset); });
  return slots.map((slot) => ({ ...slot, copy: canonical.get(slot.at) !== slot.offset }));
}

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

/** Never slice a word: a too-long first word is represented by an ellipsis. */
export function fitArtistTitle(title: string, available: number, measure: (text: string) => number) {
  const text = title.trim().replace(/\s+/g, " ");
  if (measure(text) <= available) return text;
  const words = text.split(" ");
  let result = "";
  for (const word of words) {
    const next = result ? `${result} ${word}` : word;
    if (measure(`${next}…`) > available) break;
    result = next;
  }
  return result ? `${result}…` : "…";
}
