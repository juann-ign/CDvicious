import type { DeckLiftSample } from "./deckLiftPrototype";

// Original DiscCanvas camera and original DiscMesh dimensions. The wrapper
// compensates their projected size; camera, geometry and materials stay intact.
export const HISTORICAL_DISC_CANVAS_SIZE = 640;
export const HISTORICAL_DISC_FACE_X = Math.atan2(4.6, .7);
export const HISTORICAL_DISC_FACE_RATIO = 1.5 / (Math.tan(20 * Math.PI / 180) * (Math.hypot(.7, 4.6) - .02));
export type HistoricalDiscStatus = "loading" | "ready" | "unavailable" | "error";
export interface HistoricalDiscPresentation { update(sample: DeckLiftSample): void; reset(): void }
