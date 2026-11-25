// Matching only: displayed names and provider IDs always retain their originals.
export function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim().replace(/\s+/g, " ");
}

// A single alternative for a provider that returned no results. Do not invent
// accented spellings or expand a name into an unbounded set of queries.
export function unaccentedSearchQuery(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}
