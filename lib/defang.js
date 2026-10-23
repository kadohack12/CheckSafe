/**
 * Link detection and defanging.
 *
 * Two problems are solved here:
 *
 *   1. Detection. Scam links reach us in two shapes: a full URL
 *      ("http://x.top/pay") and a bare domain ("x-pay.top"). Both must be
 *      recognised, because the second one is the more common in a printed
 *      email body.
 *
 *   2. Defanging. A message we display back to the user must never offer a
 *      clickable route to the attacker. "Defanging" is the standard practice
 *      of neutralising a URL so it stays readable but stops being a link:
 *      "https://bit.ly/xyz" becomes "hxxps://bit[.]ly/xyz".
 *
 * The module is pure and dependency-free, so the same code runs in the
 * browser, on the server and in the tests.
 */

// One alternation, written as a literal on purpose.
//
// A label is a run of alphanumerics that may contain inner hyphens. A bare
// domain is one or more labels followed by a 2+ letter TLD, plus an optional
// path. Digits-only suffixes (versions, amounts) cannot match.
//
// This must stay a regex literal: building the same pattern with
// `new RegExp(\`...\`)` lets the production minifier constant-fold the template
// and double the `\b` escape, which silently breaks bare-domain detection in
// the deployed bundle while every test still passes on the source.
const LINK_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"']*)?/gi;

/** Sentence punctuation is not part of the link. */
function trimTrailingPunctuation(value) {
  return value.replace(/[.,;:!?]+$/, "");
}

/**
 * Extracts the links found in a text, exactly as they appear in it.
 * Because the returned strings are literal substrings of the input, they can
 * safely be used as highlight quotes.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function extractLinks(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  const matches = text.match(LINK_PATTERN) || [];
  const links = [];
  for (const match of matches) {
    const trimmed = trimTrailingPunctuation(match);
    if (trimmed && !links.includes(trimmed)) links.push(trimmed);
  }
  return links;
}

/** True when the text contains at least one link. */
export function hasLinks(text) {
  return extractLinks(text).length > 0;
}

/**
 * Neutralises a single URL so it cannot be clicked, while staying readable.
 * @param {string} url
 * @returns {string}
 */
export function defangUrl(url) {
  // Order matters. The `www.` prefix needs no special case: the global dot
  // replacement below already turns it into `www[.]`. Handling it separately
  // inserted a dot that the next line then defanged a second time, producing
  // `www[[.]]example.com`.
  return String(url)
    .replace(/^https:\/\//i, "hxxps://")
    .replace(/^http:\/\//i, "hxxp://")
    .replace(/\./g, "[.]")
    .replace(/@/g, "[@]");
}

/**
 * Neutralises every link in a text, leaving the rest untouched.
 * @param {string} text
 * @returns {string}
 */
export function defangText(text) {
  if (typeof text !== "string" || text.length === 0) return text ?? "";
  return text.replace(LINK_PATTERN, (match) => {
    const trailing = match.match(/[.,;:!?]+$/)?.[0] ?? "";
    const core = trailing ? match.slice(0, -trailing.length) : match;
    return defangUrl(core) + trailing;
  });
}
