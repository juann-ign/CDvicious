export type DeckBounds = { left: number; top: number; right: number; bottom: number };
export function fitDeck(bounds: DeckBounds, width: number, height: number, centerX: number, bottom: number) {
  const scale = Math.max(.1, Math.min(width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top)));
  return { scale, x: centerX - (bounds.left + bounds.right) * scale / 2, y: bottom - bounds.bottom * scale };
}

type SplitDeckFrame = { width: number; height: number; bookletLeft: number | null };
const SPLIT_HEIGHT_RATIO = 1.16;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const validBounds = (bounds: DeckBounds) => Object.values(bounds).every(Number.isFinite)
  && finitePositive(bounds.right - bounds.left) && finitePositive(bounds.bottom - bounds.top);

/** Split fits the measured silhouettes in the space before the actual booklet.
 * Deck keeps its existing fit and camera; both Split poses share one baseline. */
export function fitSplitDeck(closed: DeckBounds, open: DeckBounds, frame: SplitDeckFrame) {
  const width = finitePositive(frame.width) ? Math.max(1, frame.width) : 1;
  const height = finitePositive(frame.height) ? Math.max(1, frame.height) : 1;
  const wide = clamp((width - 1280) / 160, 0, 1);
  const bookletLeft = clamp(frame.bookletLeft !== null && Number.isFinite(frame.bookletLeft) ? frame.bookletLeft : width * .54, 1, width);
  // Insets only contract for a genuinely tiny/degenerate measured region.
  const margin = Math.min(8 + 8 * wide, bookletLeft / 4);
  const gap = Math.min(16 + 8 * wide, bookletLeft / 4);
  const target = Math.max(.001, (width * .48 - 24) * (1.10 + .08 * wide));
  const slotWidth = Math.max(.001, Math.min(target, bookletLeft - margin - gap));
  const centerX = margin + slotWidth / 2;
  const top = Math.min(24, height / 4);
  const maxBottom = height - top;

  const fitWithin = (bounds: DeckBounds, availableHeight: number, bottom: number) => {
    if (!validBounds(bounds)) return { scale: 0, scaleY: 0, x: centerX, y: bottom };
    const measuredWidth = bounds.right - bounds.left, measuredHeight = bounds.bottom - bounds.top;
    // Give the front and top more height in Split's width-limited slot.
    const scale = Math.min(slotWidth / measuredWidth, availableHeight / (measuredHeight * SPLIT_HEIGHT_RATIO));
    const scaleY = scale * SPLIT_HEIGHT_RATIO;
    return { scale, scaleY, x: centerX - (bounds.left + bounds.right) * scale / 2, y: bottom - bounds.bottom * scaleY };
  };
  const closedHeight = Math.min(Math.max(.001, height - 96), maxBottom - top);
  const initial = fitWithin(closed, closedHeight, 0);
  const visibleHeight = validBounds(closed) ? (closed.bottom - closed.top) * initial.scaleY : 0;
  const bottom = clamp(height * .48 + visibleHeight / 2, top + visibleHeight, maxBottom);
  const closedFit = fitWithin(closed, closedHeight, bottom);
  const openFit = fitWithin(open, bottom - top, bottom);
  return { closed: closedFit, open: openFit,
    slot: { left: margin, right: margin + slotWidth, top, bottom, centerY: bottom - visibleHeight / 2, gap } };
}
