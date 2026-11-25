export type DeckBounds = { left: number; top: number; right: number; bottom: number };
export function fitDeck(bounds: DeckBounds, width: number, height: number, centerX: number, bottom: number) {
  const scale = Math.max(.1, Math.min(width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top)));
  return { scale, x: centerX - (bounds.left + bounds.right) * scale / 2, y: bottom - bounds.bottom * scale };
}

type SplitDeckFrame = { width: number; height: number; bookletLeft: number | null };
const SPLIT_HEIGHT_RATIO = 1.16;
const SPLIT_ROTATION = -1.8;
const splitRadians = SPLIT_ROTATION * Math.PI / 180;
const splitCos = Math.cos(splitRadians);
const splitSin = Math.sin(splitRadians);
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
  const margin = Math.min(clamp(width * .022, 24, 40), bookletLeft / 4);
  const gap = Math.min(16 + 8 * wide, bookletLeft / 4);
  const target = Math.max(.001, (width * .48 - 24) * (1.10 + .08 * wide));
  const slotWidth = Math.max(.001, Math.min(target, bookletLeft - margin - gap));
  const centerX = margin + slotWidth / 2;
  const top = Math.min(24, height / 4);
  const maxBottom = height - top;

  const fitWithin = (bounds: DeckBounds, availableHeight: number, bottom: number) => {
    if (!validBounds(bounds)) return { scale: 0, scaleY: 0, x: centerX, y: bottom };
    const scale = Math.min(slotWidth / (bounds.right - bounds.left), availableHeight / (bounds.bottom - bounds.top));
    return { scale, scaleY: scale * SPLIT_HEIGHT_RATIO, x: centerX - (bounds.left + bounds.right) * scale / 2,
      y: bottom - bounds.bottom * scale };
  };
  // Fit the tilted silhouette after stretching it vertically. The outer
  // rotation and both scale axes match the order of the scene's CSS transform.
  const closedPose = orientForSplit(closed);
  const openPose = orientForSplit(open);
  const closedHeight = Math.min(Math.max(.001, height - 96), maxBottom - top);
  const initial = fitWithin(closedPose, closedHeight, 0);
  const visibleHeight = validBounds(closedPose) ? (closedPose.bottom - closedPose.top) * initial.scale : 0;
  const bottom = clamp(height * .48 + visibleHeight / 2, top + visibleHeight, maxBottom);
  const closedFit = fitWithin(closedPose, closedHeight, bottom);
  const openFit = fitWithin(openPose, bottom - top, bottom);
  return { closed: closedFit, open: openFit,
    rotation: SPLIT_ROTATION,
    slot: { left: margin, right: margin + slotWidth, top, bottom, centerY: bottom - visibleHeight / 2, gap } };
}

function orientForSplit(bounds: DeckBounds): DeckBounds {
  if (!validBounds(bounds)) return bounds;
  const corners = [bounds.left, bounds.right].flatMap(x =>
    [bounds.top, bounds.bottom].map(y => ({
      x: x * splitCos - y * SPLIT_HEIGHT_RATIO * splitSin,
      y: x * splitSin + y * SPLIT_HEIGHT_RATIO * splitCos,
    })));
  return { left: Math.min(...corners.map(corner => corner.x)), right: Math.max(...corners.map(corner => corner.x)),
    top: Math.min(...corners.map(corner => corner.y)), bottom: Math.max(...corners.map(corner => corner.y)) };
}
