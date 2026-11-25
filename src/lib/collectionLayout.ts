/** Complete rows of legible acrylic cases; the remaining catalog is paginated.
 * Keep this footprint aligned with JewelCaseFront: ratio 1.08 plus 52px details.
 * A taller frame may add rows, but never shrinks desktop covers below 100px.
 */
export function collectionLayout(width: number, height: number) {
  const gap = 20;
  const rowGap = 18;
  const padding = 6;
  const minimumWidth = 100;
  const caseRatio = 1.08;
  const detailsHeight = 52;
  const frameWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const availableHeight = Number.isFinite(height) ? Math.max(0, height - 2 * padding) : 0;
  const columns = Math.floor((frameWidth + gap) / (minimumWidth + gap));
  const minimumCardHeight = minimumWidth / caseRatio + detailsHeight;
  const rows = columns ? Math.floor((availableHeight + rowGap) / (minimumCardHeight + rowGap)) : 0;
  if (!rows) {
    return { columns, rows, caseWidth: 0, cardHeight: 0, capacity: 0, gap, rowGap, padding };
  }

  const maximumWidth = Math.min(118, (frameWidth - (columns - 1) * gap) / columns);
  const widthForRows = ((availableHeight - (rows - 1) * rowGap) / rows - detailsHeight) * caseRatio;
  // Round down to a quarter pixel so browser rounding cannot crop the last row.
  const caseWidth = Math.max(minimumWidth, Math.floor(Math.min(maximumWidth, widthForRows) * 4) / 4);
  const cardHeight = caseWidth / caseRatio + detailsHeight;
  return { columns, rows, caseWidth, cardHeight, capacity: columns * rows, gap, rowGap, padding };
}

export function pageForAnchor(page: number, previousSize: number, nextSize: number, count: number, anchorIndex = page * previousSize) {
  if (nextSize <= 0) return 0;
  return Math.max(0, Math.min(Math.floor(anchorIndex / nextSize), Math.max(0, Math.ceil(count / nextSize) - 1)));
}
