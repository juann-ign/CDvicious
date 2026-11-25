export interface DiscPoint { x: number; y: number }
export interface DiscQuad { tl: DiscPoint; tr: DiscPoint; bl: DiscPoint; br: DiscPoint }
export interface DiscFlightOrigin {
  quad: DiscQuad;
  width: number;
  height: number;
  visual: HTMLElement;
  albumId?: string;
  reverse: boolean;
  rotation: number;
}
export type DiscLoadPhase = "lifting" | "travelling" | "opening" | "lowering" | "closing" | "complete";
export const DISC_FLIGHT_DURATION_MS = 3800;
export const DISC_DOCK_PROGRESS = .91;
const corners = ["tl", "tr", "bl", "br"] as const;
const epsilon = 1e-8;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export function discQuadArea(quad: DiscQuad) {
  const points = [quad.tl, quad.tr, quad.br, quad.bl];
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - point.y * next.x;
  }, 0)) / 2;
}

export function validDiscQuad(quad: DiscQuad) {
  return corners.every((corner) => Number.isFinite(quad[corner].x) && Number.isFinite(quad[corner].y)) && discQuadArea(quad) > epsilon;
}

/** Read actual projected plane corners, never an axis-aligned bounding box. */
export function readDiscQuad(element: HTMLElement | null): DiscQuad | null {
  if (!element?.isConnected) return null;
  const points: Partial<DiscQuad> = {};
  for (const corner of corners) {
    const marker = element.querySelector<HTMLElement>(`[data-disc-pose-corner="${corner}"]`);
    if (!marker) return null;
    const rect = marker.getBoundingClientRect();
    points[corner] = { x: rect.left, y: rect.top };
  }
  const quad = points as DiscQuad;
  return validDiscQuad(quad) ? quad : null;
}

/** Homography from a local unit square to a perspective-projected CD plane. */
export function discQuadHomography(quad: DiscQuad): number[] | null {
  if (!validDiscQuad(quad)) return null;
  const { tl: a, tr: b, br: c, bl: d } = quad;
  const dx1 = b.x - c.x, dx2 = d.x - c.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y;
  const dx3 = a.x - b.x + c.x - d.x;
  const dy3 = a.y - b.y + c.y - d.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > epsilon) {
    const determinant = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(determinant) < epsilon) return null;
    g = (dx3 * dy2 - dx2 * dy3) / determinant;
    h = (dx1 * dy3 - dx3 * dy1) / determinant;
  }
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
    b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h, 1];
}

export function projectDiscPoint(matrix: number[], x: number, y: number): DiscPoint {
  const divisor = matrix[6] * x + matrix[7] * y + matrix[8];
  return { x: (matrix[0] * x + matrix[1] * y + matrix[2]) / divisor, y: (matrix[3] * x + matrix[4] * y + matrix[5]) / divisor };
}

export function discQuadCenter(quad: DiscQuad): DiscPoint {
  const homography = discQuadHomography(quad);
  return homography ? projectDiscPoint(homography, .5, .5) : { x: (quad.tl.x + quad.br.x) / 2, y: (quad.tl.y + quad.br.y) / 2 };
}

export function quadToCssMatrix(quad: DiscQuad, width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const h = discQuadHomography(quad);
  if (!h) return null;
  const matrix = [h[0] / width, h[3] / width, 0, h[6] / width, h[1] / height, h[4] / height, 0, h[7] / height, 0, 0, 1, 0, h[2], h[5], 0, 1];
  return `matrix3d(${matrix.map((value) => Math.abs(value) < 1e-12 ? 0 : value).join(",")})`;
}

export function shortestDiscAngle(from: number, to: number, progress: number) {
  const turn = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + turn * clamp(progress);
}

function decomposeDiscQuad(quad: DiscQuad) {
  const center = discQuadCenter(quad);
  const x = { x: ((quad.tr.x - quad.tl.x) + (quad.br.x - quad.bl.x)) / 2, y: ((quad.tr.y - quad.tl.y) + (quad.br.y - quad.bl.y)) / 2 };
  const y = { x: ((quad.bl.x - quad.tl.x) + (quad.br.x - quad.tr.x)) / 2, y: ((quad.bl.y - quad.tl.y) + (quad.br.y - quad.tr.y)) / 2 };
  const width = Math.max(epsilon, Math.hypot(x.x, x.y));
  const height = Math.max(epsilon, Math.abs(x.x * y.y - x.y * y.x) / width);
  const roll = Math.atan2(x.y, x.x);
  const cos = Math.cos(roll), sin = Math.sin(roll);
  const normalized = {} as DiscQuad;
  for (const corner of corners) {
    const dx = quad[corner].x - center.x, dy = quad[corner].y - center.y;
    normalized[corner] = { x: (dx * cos + dy * sin) / width, y: (-dx * sin + dy * cos) / height };
  }
  return { center, width, height, roll, normalized };
}

/** Deroll first: 180-degree rotations never collapse all four corners. */
export function interpolateDiscQuad(from: DiscQuad, to: DiscQuad, progress: number, position?: DiscPoint): DiscQuad {
  const t = clamp(progress);
  if (!position && t === 0) return from;
  if (!position && t === 1) return to;
  const a = decomposeDiscQuad(from), b = decomposeDiscQuad(to);
  const center = position ?? { x: mix(a.center.x, b.center.x, t), y: mix(a.center.y, b.center.y, t) };
  const width = mix(a.width, b.width, t), height = mix(a.height, b.height, t);
  const roll = shortestDiscAngle(a.roll, b.roll, t);
  const cos = Math.cos(roll), sin = Math.sin(roll);
  const quad = {} as DiscQuad;
  for (const corner of corners) {
    const x = mix(a.normalized[corner].x, b.normalized[corner].x, t) * width;
    const y = mix(a.normalized[corner].y, b.normalized[corner].y, t) * height;
    quad[corner] = { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
  }
  return quad;
}

export function translateDiscQuad(quad: DiscQuad, x: number, y: number): DiscQuad {
  return Object.fromEntries(corners.map((corner) => [corner, { x: quad[corner].x + x, y: quad[corner].y + y }])) as unknown as DiscQuad;
}

export function sampleDiscFlight(origin: DiscQuad, target: DiscQuad, air: DiscQuad, elapsedMs: number) {
  const p = clamp(elapsedMs / DISC_FLIGHT_DURATION_MS);
  const lift = Math.min(100, Math.max(48, Math.sqrt(discQuadArea(origin)) * .3));
  const raised = translateDiscQuad(origin, 0, -lift);
  let quad: DiscQuad;
  let phase: DiscLoadPhase;
  let lidOffset = 0;
  if (p < .18) {
    phase = "lifting";
    quad = translateDiscQuad(origin, 0, -lift * smooth(p / .18));
  } else if (p < .58) {
    phase = "travelling";
    const t = smooth((p - .18) / .4);
    const a = discQuadCenter(raised), b = discQuadCenter(air);
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.min(80, Math.hypot(a.x - b.x, a.y - b.y) * .2) };
    const center = { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * mid.x + t ** 2 * b.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * mid.y + t ** 2 * b.y };
    quad = interpolateDiscQuad(raised, air, t, center);
  } else if (p < .74) {
    phase = "opening";
    lidOffset = 135 * smooth((p - .58) / .16);
    quad = air;
  } else if (p < DISC_DOCK_PROGRESS) {
    phase = "lowering";
    lidOffset = 135;
    quad = interpolateDiscQuad(air, target, smooth((p - .74) / (DISC_DOCK_PROGRESS - .74)));
  } else {
    phase = p === 1 ? "complete" : "closing";
    lidOffset = 135 * (1 - smooth((p - DISC_DOCK_PROGRESS) / (1 - DISC_DOCK_PROGRESS)));
    quad = target;
  }
  return { quad, phase, lidOffset, progress: p, docked: p >= DISC_DOCK_PROGRESS, complete: p === 1 };
}

let motionSupport: boolean | null = null;
export function supportsDiscFlightMotion() {
  if (typeof document === "undefined") return false;
  if (motionSupport !== null) return motionSupport;
  let context: WebGL2RenderingContext | null = null;
  try { context = document.createElement("canvas").getContext("webgl2"); } catch { /* static equipment remains usable */ }
  motionSupport = Boolean(context);
  context?.getExtension("WEBGL_lose_context")?.loseContext();
  return motionSupport;
}

function inlineComputedStyle(source: Element, target: HTMLElement, pseudo?: string) {
  const computed = getComputedStyle(source, pseudo);
  for (const property of computed) target.style.setProperty(property, computed.getPropertyValue(property));
  target.style.setProperty("animation", "none", "important");
  target.style.setProperty("transition", "none", "important");
  target.style.setProperty("pointer-events", "none", "important");
  return computed;
}

function frozenDiscVisual(element: HTMLElement, width: number, height: number) {
  const clone = element.cloneNode(true) as HTMLElement;
  const originals = [element, ...element.querySelectorAll<HTMLElement>("*")];
  const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
  originals.forEach((original, index) => {
    const copy = copies[index];
    inlineComputedStyle(original, copy);
    for (const name of copy.getAttributeNames()) {
      if (name === "class" || name === "id" || name === "role" || name === "tabindex" || name === "autofocus" || name === "contenteditable" || name === "href" || name.startsWith("on") || name.startsWith("data-") || name.startsWith("aria-")) copy.removeAttribute(name);
    }
    if (original instanceof HTMLImageElement && copy instanceof HTMLImageElement) {
      copy.src = original.currentSrc || original.src;
      copy.removeAttribute("srcset"); copy.removeAttribute("sizes");
    }
    if (copy.matches("button,input,select,textarea")) copy.setAttribute("disabled", "");
    // Materialize the hub's decorative pseudo-elements before removing its
    // classes. The clone no longer depends on hover or source ancestor rules.
    for (const pseudo of ["::before", "::after"]) {
      const style = getComputedStyle(original, pseudo);
      if (style.content === "none" || style.content === "normal" || style.display === "none") continue;
      const decoration = document.createElement("span");
      inlineComputedStyle(original, decoration, pseudo);
      try { decoration.textContent = JSON.parse(style.content); } catch { decoration.textContent = ""; }
      if (pseudo === "::before") copy.prepend(decoration); else copy.append(decoration);
    }
  });
  clone.querySelectorAll("script,iframe,object,embed,video,audio,source,[data-disc-pose-corner],[data-disc-pose-center]").forEach((node) => node.remove());
  clone.inert = true;
  clone.setAttribute("aria-hidden", "true");
  for (const [property, value] of Object.entries({ position: "absolute", inset: "auto", left: "0px", top: "0px", right: "auto", bottom: "auto", margin: "0px", width: `${width}px`, height: `${height}px`, transform: "none", translate: "none", rotate: "none", scale: "none", opacity: "1", visibility: "visible", "transform-origin": "0 0" })) clone.style.setProperty(property, value, "important");
  return clone;
}

/** Capture before the source is hidden or unmounted by its playback handler. */
export function captureDiscOrigin(element: HTMLElement): DiscFlightOrigin | null {
  const quad = readDiscQuad(element);
  if (!quad) return null;
  const style = getComputedStyle(element);
  const width = parseFloat(style.width) || element.offsetWidth;
  const height = parseFloat(style.height) || element.offsetHeight;
  if (!(width > 0 && height > 0)) return null;
  return { quad, width, height, visual: frozenDiscVisual(element, width, height), albumId: element.dataset.albumId, reverse: element.dataset.flipped === "true", rotation: Number(element.getAttribute("aria-valuenow")) || 0 };
}
