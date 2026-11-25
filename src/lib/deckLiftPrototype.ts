import { discQuadCenter, interpolateDiscQuad, translateDiscQuad, type DiscQuad } from "./discFlightGeometry";

export type DeckLiftPhase = "docked" | "opening" | "lifting" | "free" | "aligning" | "lowering" | "closing";
export const DECK_LIFT_OUT_MS = 1450;
export const DECK_LIFT_IN_MS = 1500;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export interface DeckLiftSample { phase: DeckLiftPhase; lid: number; retreat: number; progress: number }

export function sampleDeckLift(direction: "out" | "in", elapsed: number): DeckLiftSample {
  const time = Math.max(0, elapsed);
  if (direction === "out") {
    if (time < 350) return { phase: "opening", lid: 135 * smooth(time / 350), retreat: 0, progress: 0 };
    const progress = clamp((time - 350) / 1100);
    return { phase: progress === 1 ? "free" : "lifting", lid: 135, retreat: smooth(progress), progress };
  }
  if (time < 500) return { phase: "aligning", lid: 135, retreat: 1 - smooth(time / 500), progress: smooth(time / 500) };
  if (time < 1150) return { phase: "lowering", lid: 135, retreat: 0, progress: smooth((time - 500) / 650) };
  const progress = smooth((time - 1150) / 350);
  return { phase: time >= DECK_LIFT_IN_MS ? "docked" : "closing", lid: 135 * (1 - progress), retreat: 0, progress };
}

/** Each visual operation owns its frames. Cancellation invalidates old callbacks. */
export function createDeckLiftTimeline() {
  let generation = 0;
  let phase: DeckLiftPhase = "docked";
  let transition: { direction: "out" | "in"; startedAt: number; generation: number } | null = null;
  return {
    get phase() { return phase; },
    get generation() { return generation; },
    start(direction: "out" | "in", now: number, reduced: boolean, allowed = true) {
      if (!allowed || transition || (direction === "out" ? phase !== "docked" : phase !== "free")) return null;
      const token = ++generation;
      phase = direction === "out" ? "opening" : "aligning";
      transition = { direction, startedAt: now - (reduced ? direction === "out" ? DECK_LIFT_OUT_MS : DECK_LIFT_IN_MS : 0), generation: token };
      return token;
    },
    sample(now: number, token: number): DeckLiftSample | null {
      if (!transition || transition.generation !== token) return null;
      const result = sampleDeckLift(transition.direction, now - transition.startedAt);
      phase = result.phase;
      if (phase === "free" || phase === "docked") transition = null;
      return result;
    },
    cancel() { ++generation; transition = null; phase = "docked"; },
  };
}

/** An upright foreground face fitted to the useful viewport, not the design canvas. */
export function foregroundDiscQuad(frame: { left: number; top: number; width: number; height: number }): DiscQuad {
  const diameter = Math.max(1, Math.min(frame.width * .54, frame.height * .62, 640));
  const centerX = frame.left + frame.width / 2, centerY = frame.top + frame.height * .62;
  return { tl: { x: centerX - diameter / 2, y: centerY - diameter / 2 }, tr: { x: centerX + diameter / 2, y: centerY - diameter / 2 },
    bl: { x: centerX - diameter / 2, y: centerY + diameter / 2 }, br: { x: centerX + diameter / 2, y: centerY + diameter / 2 } };
}

/** Lifecycle/reset/resize emissions are not navigation. Compare the native
 * position with the current chapter origin, including fractional movement. */
export function hasDeckChapterMovement(scrollLeft: number, chapterLeft: number) {
  return Number.isFinite(scrollLeft) && Number.isFinite(chapterLeft) && Math.abs(scrollLeft - chapterLeft) > .1;
}

export function retreatedDeckTransform(frame: { left: number; top: number; width: number; height: number },
  design: { left: number; top: number; width: number }, surfaces: { left: number; right: number; top: number; bottom: number }, density: number) {
  const margin = Math.min(24, frame.height * .04), usefulHeight = frame.height * .25;
  const scale = Math.min(.72, frame.width * .70 / (surfaces.right - surfaces.left), usefulHeight / (surfaces.bottom - surfaces.top));
  const placementScale = design.width / (1280 * density);
  return { scale,
    x: (frame.left + frame.width / 2 - (design.left + ((surfaces.left + surfaces.right) / 2 - design.left) * scale)) / placementScale,
    y: (frame.top + margin + usefulHeight - (design.top + (surfaces.bottom - design.top) * scale)) / placementScale };
}

export function sampleLiftedDisc(origin: DiscQuad, foreground: DiscQuad, progress: number, viewportHeight: number) {
  const raised = translateDiscQuad(origin, 0, -Math.min(100, viewportHeight * .13));
  if (progress <= .22) return interpolateDiscQuad(origin, raised, smooth(progress / .22));
  return interpolateDiscQuad(raised, foreground, smooth((progress - .22) / .78));
}

export function airAboveDock(dock: DiscQuad, viewportHeight: number): DiscQuad {
  const center = discQuadCenter(dock);
  const rise = Math.min(viewportHeight * .22, Math.max(50, Math.abs(center.y - dock.tl.y) * 1.2));
  return translateDiscQuad(dock, 0, -rise);
}

export interface DiscOrientation { x: number; y: number }
export function draggedDiscOrientation(dx: number, dy: number): DiscOrientation {
  return { x: Math.max(-50, Math.min(50, -dy * .35)), y: Math.max(-65, Math.min(65, dx * .4)) };
}
export function returnedDiscOrientation(from: DiscOrientation, progress: number): DiscOrientation {
  const remaining = Math.pow(1 - clamp(progress), 3);
  return { x: from.x * remaining, y: from.y * remaining };
}
