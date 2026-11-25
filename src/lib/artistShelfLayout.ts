export interface ArtistShelfLayout {
  count: number;
  width: number;
  slotWidth: number;
  visualOverflow: number;
  visualLeft: number;
  startAt: "center" | "leading";
  speed: number;
  overscan: number;
  pitch: number;
  inset: number;
  length: number;
  fit: boolean;
}

export const ARTIST_SHELF_SPEED = 90;
export const LISTENING_SHELF_SPEED = 72;
export const ARTIST_SHELF_GAP = 8;
export const ARTIST_SHELF_REENTRY_SECONDS = 2;
export const ARTIST_SHELF_INITIAL_HOLD_MS = 1000;
export const wrapArtistShelf = (value: number, length: number) => length > 0 ? ((value % length) + length) % length : 0;

export function artistShelfLayout(count: number, width: number, slotWidth: number, caseSize: number, speed = ARTIST_SHELF_SPEED, visualLeft = 0, startAt: ArtistShelfLayout["startAt"] = "center"): ArtistShelfLayout {
  const visualOverflow = Math.max(0, caseSize * .23);
  const overscan = visualOverflow + 12;
  const naturalWidth = count * slotWidth + Math.max(0, count - 1) * ARTIST_SHELF_GAP;
  const fit = count <= 1 || naturalWidth + overscan * 2 <= width;
  const pitch = fit ? slotWidth + ARTIST_SHELF_GAP : Math.max(slotWidth + ARTIST_SHELF_GAP, (width - overscan * 2) / 6.5);
  return {
    count, width, slotWidth, visualOverflow, visualLeft, startAt, speed, overscan, pitch, fit,
    inset: fit ? Math.max(0, (width - naturalWidth) / 2) : overscan,
    // A recycled node is already fully out at both ends. Near capacity, the
    // first edition waits off the right edge for two seconds after it exits.
    length: fit ? 0 : Math.max(count * pitch + overscan * 2, width + slotWidth + overscan * 2 + speed * ARTIST_SHELF_REENTRY_SECONDS),
  };
}

export function artistShelfPosition(index: number, offset: number, layout: ArtistShelfLayout, entry = false) {
  const natural = layout.inset + index * layout.pitch;
  if (layout.fit) return natural;
  const minimum = -layout.slotWidth - layout.overscan;
  // During the first traversal the tail stays to the right in real catalog
  // order. Only an edition that has fully left may return behind that tail.
  if (entry && natural - offset >= minimum) return natural - offset;
  return wrapArtistShelf(natural - offset - minimum, layout.length) + minimum;
}

export function artistShelfOffsetFor(index: number, left: number, layout: ArtistShelfLayout, entry = false) {
  const offset = layout.inset + index * layout.pitch - left;
  return layout.fit ? 0 : entry ? offset : wrapArtistShelf(offset, layout.length);
}

export function artistShelfInitialOffset(layout: ArtistShelfLayout) {
  const edge = layout.startAt === "leading" ? Math.min(24, layout.width * .04) : layout.width / 2;
  return artistShelfOffsetFor(0, edge - layout.visualLeft, layout, true);
}

export function artistShelfEntryComplete(offset: number, layout: ArtistShelfLayout) {
  return offset >= layout.inset + layout.slotWidth + layout.overscan;
}

/** Keep a retained edition in place when a page arrives, a filter or size changes. */
export function rebaseArtistShelf(previousIds: readonly string[], ids: readonly string[], previousOffset: number, previous: ArtistShelfLayout | null, next: ArtistShelfLayout, preferred?: string | null, entry = false) {
  if (next.fit || !ids.length) return 0;
  if (!previous || !previousIds.length) return artistShelfInitialOffset(next);
  const candidates = previousIds.map((id, index) => ({ id, x: artistShelfPosition(index, previousOffset, previous, entry) }))
    .filter(({ id }) => ids.includes(id));
  const anchor = candidates.find(({ id }) => id === preferred)
    ?? candidates.filter(({ x }) => x >= 0 && x + previous.slotWidth <= previous.width).sort((a, b) => a.x - b.x)[0]
    ?? candidates[0];
  if (!anchor) return 0;
  const left = previous.width > 0 ? anchor.x / previous.width * next.width : anchor.x;
  return artistShelfOffsetFor(ids.indexOf(anchor.id), left, next, entry);
}
