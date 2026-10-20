/**
 * Privacy redaction.
 *
 * Scam messages routinely contain the victim's own personal data: the phone
 * number they are being asked to call back, the account number they are told
 * to verify, the card number being "confirmed". That data is not needed to
 * judge whether a message is a scam, so we remove it before the text leaves
 * the user's browser.
 *
 * This module is deliberately pure and dependency-free so it can run on both
 * the client (to show the user what was masked) and the server (as the real
 * enforcement point, since the API can be called directly).
 *
 * Design rule: only redact what is unambiguously personal. Amounts are only
 * masked when attached to a currency, because a bare number ("24h", "6-digit
 * code") carries scam signal and masking it would make the analysis worse.
 */

const PATTERNS = [
  {
    type: "email",
    label: "email address",
    token: "[EMAIL]",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    type: "iban",
    label: "bank account (IBAN)",
    token: "[IBAN]",
    // Two letters + two check digits, then 11 to 30 alphanumerics, optionally
    // grouped in blocks of four. Validated below to avoid matching prose.
    regex: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g,
  },
  {
    type: "phone",
    label: "phone number",
    token: "[PHONE]",
    // International form: a leading + is an unambiguous phone signal.
    regex: /\+\d[\d\s().-]{6,18}\d/g,
  },
  {
    type: "phone",
    label: "phone number",
    token: "[PHONE]",
    // National form: a leading 0 followed by grouped pairs, e.g. 06 12 34 56 78.
    regex: /\b0\d(?:[\s.-]?\d{2}){4}\b/g,
  },
  {
    type: "phone",
    label: "phone number",
    token: "[PHONE]",
    // National form without separators: 10 digits starting with 0.
    regex: /\b0\d{9}\b/g,
  },
  {
    type: "phone",
    label: "phone number",
    token: "[PHONE]",
    // North-American form: (555) 123-4567 or 555-123-4567.
    regex: /\b\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
  },
  {
    type: "card",
    label: "card number",
    token: "[CARD]",
    // 13 to 19 digits, optionally separated. Runs after phone patterns so an
    // international phone number is not swallowed as a card number.
    regex: /\b(?:\d[ -]?){13,19}\b/g,
  },
  {
    type: "amount",
    label: "amount",
    token: "[AMOUNT]",
    // Currency as a suffix: 2,99 € / 480 EUR / 1 200.50 USD
    // The trailing guard is (?![A-Za-z]) rather than \b: a word boundary can
    // never follow a symbol such as €, so "480 €" would slip through.
    regex:
      /\b\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?\s?(?:€|\$|£|EUR|USD|GBP|CHF)(?![A-Za-z])/gi,
  },
  {
    type: "amount",
    label: "amount",
    token: "[AMOUNT]",
    // Currency as a prefix: €2.99 / $1,200
    regex: /(?:€|\$|£)\s?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,2})?/g,
  },
];

/** An IBAN is 15 to 34 characters once spaces are removed. */
function isValidIban(match) {
  const compact = match.replace(/\s/g, "");
  return compact.length >= 15 && compact.length <= 34 && /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact);
}

/** A card-like run must contain at least 13 actual digits. */
function isValidCard(match) {
  const digits = match.replace(/\D/g, "");
  return digits.length >= 13 && digits.length <= 19;
}

/**
 * Removes personal data from a message.
 *
 * @param {string} text
 * @returns {{ text: string, total: number, labels: string[] }}
 *   `text` is the redacted message; `labels` is the distinct, human-readable
 *   list of what was found, for display to the user.
 */
export function redactSensitiveData(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { text: text ?? "", total: 0, labels: [] };
  }

  let output = text;
  let total = 0;
  const labels = [];

  for (const pattern of PATTERNS) {
    output = output.replace(pattern.regex, (match) => {
      if (pattern.type === "iban" && !isValidIban(match)) return match;
      if (pattern.type === "card" && !isValidCard(match)) return match;
      total += 1;
      if (!labels.includes(pattern.label)) labels.push(pattern.label);
      return pattern.token;
    });
  }

  return { text: output, total, labels };
}
