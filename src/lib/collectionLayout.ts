/** Physical case face (1.08:1), three metadata lines and keyboard focus clearance. */
export function collectionLayout(width: number, height: number) {
  const gap = 8, minimum = 148, maximum = 184, caption = 62;
  const availableWidth = Math.max(1, width - 12);
  const availableHeight = Math.max(1, height - 12);
  let best = { columns: 1, rows: 1, caseWidth: Math.min(maximum, availableWidth), capacity: 1 };
  for (let rows = 1; rows <= 4; rows++) {
    const heightWidth = ((availableHeight - (rows - 1) * gap) / rows - caption) * 1.08;
    if (heightWidth < minimum) continue;
    const columns = Math.max(1, Math.floor((availableWidth + gap) / (minimum + gap)));
    const caseWidth = Math.min(maximum, heightWidth, (availableWidth - (columns - 1) * gap) / columns);
    if (caseWidth >= minimum && rows * columns > best.capacity) best = { columns, rows, caseWidth, capacity: columns * rows };
  }
  return best;
}

export function pageForAnchor(page: number, previousSize: number, nextSize: number, count: number, anchorIndex = page * previousSize) {
  return Math.max(0, Math.min(Math.floor(anchorIndex / nextSize), Math.max(0, Math.ceil(count / nextSize) - 1)));
}
