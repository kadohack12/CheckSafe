/**
 * Turns a message plus a list of exact quotes into segments to render, so the
 * user can see the dangerous wording in its original context.
 *
 * This is why the model is required to copy quotes word for word: if a quote
 * does not appear literally in the text, there is no index to find and nothing
 * can be highlighted. Quotes that do not match are ignored rather than
 * approximated, because highlighting the wrong words would mislead the user.
 */

/**
 * @param {string} text the message that was analysed
 * @param {string[]} quotes exact excerpts expected to appear in `text`
 * @returns {Array<{ text: string, highlighted: boolean }>}
 */
export function buildHighlightSegments(text, quotes) {
  if (typeof text !== "string" || text.length === 0) return [];

  const ranges = [];
  for (const quote of Array.isArray(quotes) ? quotes : []) {
    if (typeof quote !== "string" || quote.trim().length < 3) continue;

    // A quote may legitimately occur several times; highlight every occurrence.
    let from = text.indexOf(quote);
    while (from !== -1) {
      ranges.push({ start: from, end: from + quote.length });
      from = text.indexOf(quote, from + quote.length);
    }
  }

  if (ranges.length === 0) return [{ text, highlighted: false }];

  // Merge overlapping ranges so nested quotes do not produce broken markup.
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [ranges[0]];
  for (const range of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const segments = [];
  let cursor = 0;
  for (const { start, end } of merged) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }

  return segments;
}
