export type DeckBounds = { left: number; top: number; right: number; bottom: number };
export function fitDeck(bounds: DeckBounds, width: number, height: number, centerX: number, bottom: number) {
  const scale = Math.max(.1, Math.min(width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top)));
  return { scale, x: centerX - (bounds.left + bounds.right) * scale / 2, y: bottom - bounds.bottom * scale };
}

/** The stereo front uses the measured metal, not the transparent design box.
 * Opening the lids keeps this same model transform and the same CD anchor. */
export function fitStereoDeck(closed: DeckBounds, open: DeckBounds, frameWidth: number, frameHeight: number) {
  const width = finitePositive(frameWidth) ? frameWidth : 1;
  const height = finitePositive(frameHeight) ? frameHeight : 1;
  const centerX = width / 2, centerY = height * .64;
  const horizontalMargin = Math.min(clamp(width * .04, 24, 64), width * .15);
  const topMargin = Math.min(clamp(height * .045, 24, 40), height * .15);
  const bottomMargin = Math.min(clamp(height * .07, 32, 64), height * .15);
  if (!validBounds(closed) || !validBounds(open)) {
    const fit = { scale: 0, x: centerX, y: centerY };
    return { closed: fit, open: { ...fit }, speakers: { height: 0, width: 0, leftX: centerX, rightX: centerX, top: centerY } };
  }
  const modelX = (closed.left + closed.right) / 2, modelY = (closed.top + closed.bottom) / 2;
  const envelope = { left: Math.min(closed.left, open.left), right: Math.max(closed.right, open.right),
    top: Math.min(closed.top, open.top), bottom: Math.max(closed.bottom, open.bottom) };
  const radius = Math.max(modelX - envelope.left, envelope.right - modelX);
  const above = modelY - envelope.top, below = envelope.bottom - modelY;
  const scale = Math.max(0, Math.min(width * .58 / (closed.right - closed.left),
    (centerX - horizontalMargin) / radius,
    above > 0 ? (centerY - topMargin) / above : Infinity,
    below > 0 ? (height - bottomMargin - centerY) / below : Infinity));
  const fit = { scale, x: centerX - modelX * scale, y: centerY - modelY * scale };
  const playerLeft = fit.x + closed.left * scale;
  const playerTop = fit.y + closed.top * scale;
  // Speaker cabinets are secondary and sit behind only the outer player corners.
  const overlap = .44, speakerRatio = .48;
  const speakerHeight = Math.max(0, Math.min(370, height * .4 + 20, height * .62,
    (playerLeft - horizontalMargin) / ((1 - overlap) * speakerRatio)));
  const speakerWidth = speakerHeight * speakerRatio;
  const leftX = playerLeft - speakerWidth * (.5 - overlap);
  const toolbarBottom = Math.min(88, Math.max(64, height * .1), height - speakerHeight);
  const preferredTop = playerTop - speakerHeight * .52;
  const speakerTop = clamp(preferredTop, toolbarBottom, Math.max(toolbarBottom, height - bottomMargin - speakerHeight));
  return { closed: fit, open: { ...fit },
    speakers: { height: speakerHeight, width: speakerWidth, leftX, rightX: width - leftX, top: speakerTop } };
}

/** Fit both parts of the listening view to the measured metal silhouette. */
export function fitListeningDeck(bounds: DeckBounds, width: number, height: number) {
  const preferredTop = Math.min(72, Math.max(62, height * .095));
  const gap = Math.min(66, Math.max(36, height * .078));
  // Keep the approved equipment width and case size. Metal chrome is fitted
  // around those objects, rather than reducing either to make the rack fit.
  const priorChrome = 104;
  const equipmentHeight = Math.min(height * .42 - 8, height - preferredTop - gap - priorChrome - 100);
  const fit = fitDeck(bounds, Math.min(1000, width * .78), Math.max(100, equipmentHeight), width / 2, 0);
  const shelfWidth = (bounds.right - bounds.left) * fit.scale;
  const visibleHeight = (bounds.bottom - bounds.top) * fit.scale;
  const priorShelfTop = preferredTop + visibleHeight + gap;
  const caseSize = Math.max(82, Math.min(198, shelfWidth * .215, height - priorShelfTop - priorChrome));
  // The current tilted acrylic extends at most 15% of its size below its slot,
  // and 16px above it on hover. Leave a real 20px grip beyond the 8/11px rims.
  const shelfPadding = 6;
  const shelfTrackBottom = Math.ceil(24 + caseSize * .15);
  const shelfHeadroom = shelfTrackBottom + 38;
  const shelfFloorDepth = shelfTrackBottom + 16;
  const shelfHeight = caseSize + shelfHeadroom + 2 * shelfPadding + 55; // 30px controls, two 9px gaps and 7px dots.
  const top = Math.min(preferredTop, Math.max(12, height - visibleHeight - gap - shelfHeight));
  const shelfTop = top + visibleHeight + gap;
  return { ...fit, y: top - bounds.top * fit.scale, shelfWidth, shelfTop, caseSize,
    shelfHeight, shelfPadding, shelfTrackBottom, shelfHeadroom, shelfFloorDepth };
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

export type SpeakerPairLayout = { height: number; width: number; leftX: number; rightX: number; top: number };

/** Fit upright cabinets behind the projected outer corners without invading
 * the adjacent booklet, controls or the foreground disc's travel area. */
function pairBehind(player: DeckBounds, region: DeckBounds, desiredHeight: number, overlap: number): SpeakerPairLayout {
  const ratio = .48;
  const outside = ratio * (1 - overlap);
  const height = Math.max(0, Math.min(desiredHeight,
    (player.left - region.left) / outside, (region.right - player.right) / outside,
    region.bottom - region.top));
  const width = height * ratio;
  return { height, width, leftX: player.left + (overlap - .5) * width,
    rightX: player.right - (overlap - .5) * width,
    top: clamp(player.top - height * .52, region.top, Math.max(region.top, region.bottom - height)) };
}

/** The Split booklet keeps its measured slot. A slim margin on either side
 * of the existing player silhouette houses the stereo cabinets. */
export function fitSplitStereoDeck(closed: DeckBounds, open: DeckBounds, frame: SplitDeckFrame) {
  const base = fitSplitDeck(closed, open, frame);
  const { slot } = base;
  const centerX = (slot.left + slot.right) / 2;
  const closedPose = orientForSplit(closed), openPose = orientForSplit(open);
  // Preserve the booklet-aligned center and deliberate perspective. Reduce
  // width only enough to leave room for the secondary pair.
  const factor = .88;
  const safeExtent = (validBounds(closedPose) ? (closedPose.bottom - closedPose.top) * base.closed.scale : 0) * factor;
  const bottom = slot.centerY + safeExtent / 2;
  const fit = (bounds: DeckBounds, scale: number) => validBounds(bounds)
    ? { scale: scale * factor, scaleY: scale * factor * SPLIT_HEIGHT_RATIO,
      x: centerX - (bounds.left + bounds.right) / 2 * scale * factor,
      y: bottom - bounds.bottom * scale * factor }
    : { scale: 0, scaleY: 0, x: centerX, y: bottom };
  const closedFit = fit(closedPose, base.closed.scale), openFit = fit(openPose, base.open.scale);
  const player = validBounds(closedPose) ? {
    left: closedFit.x + closedPose.left * closedFit.scale, right: closedFit.x + closedPose.right * closedFit.scale,
    top: closedFit.y + closedPose.top * closedFit.scale, bottom,
  } : { left: centerX, right: centerX, top: bottom, bottom };
  const top = Math.min(76, Math.max(slot.top, frame.height * .14), Math.max(0, player.bottom - 12));
  const speakers = pairBehind(player, { left: slot.left, right: slot.right, top, bottom: Math.max(top, player.bottom - 12) },
    Math.min(260, safeExtent * .84), .60);
  return { closed: closedFit, open: openFit, rotation: base.rotation, slot: { ...slot, bottom }, speakers };
}

/** The raised pose is measured by the lift itself, after its final camera
 * transform. Keep that center and lower edge fixed, reserving a little width
 * only when the compact Split slot cannot fit the pair. */
export function fitRetreatedStereoDeck(player: DeckBounds, region: DeckBounds, split: boolean) {
  if (!validBounds(player)) return { scale: 1, speakers: { height: 0, width: 0, leftX: 0, rightX: 0, top: 0 } };
  const width = player.right - player.left, height = player.bottom - player.top;
  const center = (player.left + player.right) / 2;
  const overlap = split ? .58 : .44;
  const desired = Math.max(0, Math.min(split ? 192 : 220, height * .90, region.bottom - region.top));
  const outside = desired * .48 * (1 - overlap);
  const halfSlot = Math.max(0, Math.min(center - region.left, region.right - center));
  // Solve for the shared proportional size; a smaller player also needs a
  // smaller speaker, so there is no arbitrary frame-size-dependent offset.
  const scale = clamp((2 * halfSlot) / (width + 2 * outside), .01, 1);
  const adjusted = { left: center - width * scale / 2, right: center + width * scale / 2,
    top: player.bottom - height * scale, bottom: player.bottom };
  const speakers = pairBehind(adjusted, { ...region, bottom: Math.min(region.bottom, adjusted.bottom - 8) }, desired * scale, overlap);
  return { scale, speakers };
}
/** Next listen lowers the full rack beneath the player. Fit the cabinets into
 * the existing upper band, keeping the original player, rack and gap intact. */
export function fitListeningStereoDeck(bounds: DeckBounds, width: number, height: number) {
  const listening = fitListeningDeck(bounds, width, height);
  const player = { left: listening.x + bounds.left * listening.scale, right: listening.x + bounds.right * listening.scale,
    top: listening.y + bounds.top * listening.scale, bottom: listening.y + bounds.bottom * listening.scale };
  // Both upper toolbar buttons keep their horizontal lanes in the full-width listen view.
  const margin = Math.min(clamp(width * .10, 24, 192) + 130, width * .24);
  const top = Math.min(24, height * .035);
  const bottom = Math.max(top, Math.min(player.bottom - 12, listening.shelfTop - 12));
  const speakers = pairBehind(player, { left: margin, right: width - margin, top, bottom },
    Math.min(260, (player.bottom - player.top) * .84), .44);
  return { ...listening, speakers };
}