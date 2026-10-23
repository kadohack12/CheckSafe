/**
 * Defanging tests.
 *
 * Two properties matter here. First, a link we display back to the user must
 * stop being clickable without losing its meaning. Second, detection must find
 * the bare domains that printed email bodies use, without turning ordinary
 * numbers, versions or abbreviations into links.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { defangText, defangUrl, extractLinks, hasLinks } from "../lib/defang.js";

test("defangs an https URL into a non-clickable form", () => {
  assert.equal(defangUrl("https://bit.ly/xyz"), "hxxps://bit[.]ly/xyz");
});

test("defangs an http URL into a non-clickable form", () => {
  assert.equal(
    defangUrl("http://secure-billing-refunds.com/claim?id=1"),
    "hxxp://secure-billing-refunds[.]com/claim?id=1",
  );
});

test("defangs a bare domain", () => {
  assert.equal(defangUrl("parcel-pay-secure.com"), "parcel-pay-secure[.]com");
});

test("a defanged URL contains no clickable scheme and no bare domain dot", () => {
  const defanged = defangUrl("https://evil.example.com/pay");
  assert.ok(!defanged.startsWith("http"));
  // Every dot is bracketed, so no live hostname survives in the string.
  assert.ok(!/(?<!\[)\.(?!\])/.test(defanged));
  assert.ok(defanged.includes("[.]"));
});

test("defangs every link in a text and leaves the prose untouched", () => {
  const text = "Pay at https://x.top now, or confirm at y-pay.com today.";
  const result = defangText(text);
  assert.equal(
    result,
    "Pay at hxxps://x[.]top now, or confirm at y-pay[.]com today.",
  );
});

test("keeps trailing sentence punctuation outside the defanged link", () => {
  const result = defangText("See http://x.top.");
  assert.equal(result, "See hxxp://x[.]top.");
});

test("defangText is a no-op when there is no link", () => {
  const text = "Bonjour, n'oublie pas le pain ce soir.";
  assert.equal(defangText(text), text);
});

test("defangText tolerates empty and non-string input", () => {
  assert.equal(defangText(""), "");
  assert.equal(defangText(null), "");
  assert.equal(defangText(undefined), "");
});

test("extractLinks finds a scheme URL exactly as written", () => {
  const text = "Confirmez: https://bit.ly/xyz maintenant";
  assert.deepEqual(extractLinks(text), ["https://bit.ly/xyz"]);
});

test("extractLinks finds a bare domain inside an email body", () => {
  const text = "Confirm your details at secure-billing-refunds.com within 48h.";
  assert.deepEqual(extractLinks(text), ["secure-billing-refunds.com"]);
});

test("extractLinks keeps the path and query of a bare domain", () => {
  const text = "Go to x-pay.com/claim?id=48213 now";
  assert.deepEqual(extractLinks(text), ["x-pay.com/claim?id=48213"]);
});

test("extractLinks strips trailing punctuation from the link", () => {
  assert.deepEqual(extractLinks("Visit evil.com."), ["evil.com"]);
});

test("extractLinks returns every distinct link once", () => {
  const text = "a.com and b.com and a.com";
  assert.deepEqual(extractLinks(text), ["a.com", "b.com"]);
});

test("extractLinks does not mistake amounts, times or versions for links", () => {
  // These are the false positives that would wreck the highlighting: "2.99"
  // and "24h" carry scam signal and must never be treated as a link.
  assert.deepEqual(extractLinks("A fee of 2.99 EUR is required within 24h."), []);
  assert.deepEqual(extractLinks("Version 1.2.3 was released."), []);
  assert.deepEqual(extractLinks("Bonjour, colis livre entre 9h et 12h."), []);
});

test("extractLinks ignores single-letter abbreviations", () => {
  assert.deepEqual(extractLinks("U.S. and e.g. and etc."), []);
});

test("hasLinks reports presence and absence", () => {
  assert.equal(hasLinks("go to https://x.top"), true);
  assert.equal(hasLinks("go to x.top"), true);
  assert.equal(hasLinks("no link here, 24h left"), false);
  assert.equal(hasLinks(""), false);
});

test("detection is deterministic across repeated calls", () => {
  // The pattern carries the global flag and is shared between calls, so a
  // stale lastIndex would make results depend on call order.
  const text = "Pay at https://x.top and confirm at y-pay.com today.";
  const first = extractLinks(text);
  for (let i = 0; i < 5; i += 1) {
    assert.deepEqual(extractLinks(text), first);
    assert.equal(defangText(text), defangText(text));
  }
  assert.deepEqual(first, ["https://x.top", "y-pay.com"]);
});

test("a www prefix is defanged exactly once", () => {
  // Regression: handling "www." separately inserted a dot that the global dot
  // replacement then defanged again, yielding "www[[.]]example.com".
  assert.equal(defangUrl("www.fake-bank.com"), "www[.]fake-bank[.]com");
  assert.equal(
    defangText("Go to www.fake-bank.com now"),
    "Go to www[.]fake-bank[.]com now",
  );
});

test("defangs the scheme and the www prefix together", () => {
  assert.equal(defangUrl("https://www.example.com"), "hxxps://www[.]example[.]com");
});
