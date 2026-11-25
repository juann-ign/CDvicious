export type DeckBounds = { left: number; top: number; right: number; bottom: number };
export function fitDeck(bounds: DeckBounds, width: number, height: number, centerX: number, bottom: number) {
  const scale = Math.max(.1, Math.min(width / (bounds.right - bounds.left), height / (bounds.bottom - bounds.top)));
  return { scale, x: centerX - (bounds.left + bounds.right) * scale / 2, y: bottom - bounds.bottom * scale };
}
