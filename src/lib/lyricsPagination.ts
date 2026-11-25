/** Boundary-only blank lines keep their original source characters, but they
 * do not leave an empty first or last line on a physical page. */
export function splitLyricsPageMargins(text: string) {
  const leading = text.match(/^(?:[^\S\n]*\n)+/)?.[0] ?? "";
  const rest = text.slice(leading.length);
  const trailing = rest.match(/(?:\n[^\S\n]*)+$/)?.[0] ?? "";
  return { leading, body: rest.slice(0, rest.length - trailing.length), trailing };
}

/** Measure the complete rendered candidate, allowing natural wrapping.
 * Independent line heights can accumulate rounding and wrapping differences.
 * Every source character is retained, including stanza separators. */
export function paginateLyricsText(text: string, firstHeight: number, pageHeight: number, measure: (text: string) => number): string[] {
  if (!text) return [];
  if (![firstHeight, pageHeight].every(height => Number.isFinite(height) && height > 0)) return [text];
  const pages: string[] = [];
  let page = "";
  let capacity = firstHeight;
  const fits = (candidate: string) => measure(splitLyricsPageMargins(candidate).body) <= capacity;
  const flush = () => {
    if (page) {
      if (!page.trim() && pages.length) pages[pages.length - 1] += page;
      else pages.push(page);
    }
    page = "";
    capacity = pageHeight;
  };
  const rows = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  for (const row of rows) {
    let remaining = row;
    while (remaining) {
      // A blank separator cannot consume a page by itself. It will either
      // separate stanzas on the same page, or remain at a hidden boundary.
      if (!remaining.trim() || fits(page + remaining)) {
        page += remaining;
        break;
      }
      if (page.trim()) {
        flush();
        continue;
      }
      if (!fits(page + remaining[0])) return [text];

      // An unusually long source line can extend over multiple pages.
      // Find the largest fitting prefix, keeping word boundaries when possible.
      let low = 1;
      let high = remaining.length;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (fits(page + remaining.slice(0, middle))) low = middle;
        else high = middle - 1;
      }
      const boundary = remaining.lastIndexOf(" ", low - 1) + 1;
      let length = boundary > 0 && remaining.slice(0, boundary).trim() ? boundary : low;
      if (length < remaining.length && /[\uD800-\uDBFF]/.test(remaining[length - 1]) && /[\uDC00-\uDFFF]/.test(remaining[length])) length--;
      if (!remaining.slice(0, length).trim()) return [text];
      page += remaining.slice(0, length);
      remaining = remaining.slice(length);
      flush();
    }
  }
  flush();
  return pages.length && pages.join("") === text ? pages : [text];
}
export function lastLyricsSpread(pageCount: number): number {
  return Math.max(0, Math.floor((pageCount - 1) / 2) * 2);
}

/** Source offsets survive a change in font metrics or page dimensions. */
export function lyricsPageOffset(pages: string[], pageIndex: number): number {
  return pages.slice(0, Math.max(0, Math.floor(pageIndex))).reduce((length, page) => length + page.length, 0);
}

/** Keep the source character in view, including when it moves to a right face. */
export function lyricsSpreadForOffset(pages: string[], sourceOffset: number): number {
  const offset = Math.max(0, Number.isFinite(sourceOffset) ? Math.floor(sourceOffset) : 0);
  let end = 0;
  for (let index = 0; index < pages.length; index++) {
    end += pages[index].length;
    if (offset < end) return Math.floor(index / 2) * 2;
  }
  return lastLyricsSpread(pages.length);
}
