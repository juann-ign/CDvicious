/** Pages retain every source character: joining the pages without a separator
 * reconstructs the normalized source, including a line split across pages. */
export function paginateLyricsText(text: string, firstHeight: number, pageHeight: number, measure: (text: string) => number): string[] {
  if (!text) return [];
  if (firstHeight <= 0 || pageHeight <= 0) return [text];
  const pages: string[] = [];
  let page = "";
  let used = 0;
  let capacity = firstHeight;
  const flush = () => { if (page) pages.push(page); page = ""; used = 0; capacity = pageHeight; };
  const lines = text.split("\n");
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    let remaining = lines[lineIndex];
    const newline = lineIndex < lines.length - 1 ? "\n" : "";
    while (true) {
      const height = measure(remaining);
      if (used + height <= capacity) { page += remaining + newline; used += height; break; }
      if (page) { flush(); continue; }
      if (!remaining || measure(remaining.slice(0, 1)) > capacity) return [text];
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (measure(remaining.slice(0, middle)) <= capacity) low = middle;
        else high = middle - 1;
      }
      // Prefer a word boundary while preserving all whitespace and characters.
      const boundary = remaining.lastIndexOf(" ", low - 1) + 1;
      const length = boundary > 0 ? boundary : low;
      page += remaining.slice(0, length);
      remaining = remaining.slice(length);
      flush();
      if (!remaining) { page += newline; break; }
    }
  }
  flush();
  return pages.length && pages.join("") === text ? pages : [text];
}
export function lastLyricsSpread(pageCount: number): number {
  return Math.max(0, Math.floor((pageCount - 1) / 2) * 2);
}
