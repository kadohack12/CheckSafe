/**
 * Highlighting tests.
 *
 * The point of these is to guarantee that we only ever highlight text that is
 * genuinely present in the message. Highlighting a paraphrase would show the
 * user words that were never written.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildHighlightSegments } from "../lib/highlight.js";

/** Rebuilds the original text from the segments. */
function rejoin(segments) {
  return segments.map((segment) => segment.text).join("");
}

/** Returns only the highlighted parts. */
function highlighted(segments) {
  return segments.filter((segment) => segment.highlighted).map((s) => s.text);
}

test("returns the whole text unhighlighted when there are no quotes", () => {
  const segments = buildHighlightSegments("Bonjour, ceci est un test.", []);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].highlighted, false);
  assert.equal(segments[0].text, "Bonjour, ceci est un test.");
});

test("highlights an exact quote in the middle of the text", () => {
  const text = "Alerte : Envoyez le code recu pour annuler.";
  const segments = buildHighlightSegments(text, ["Envoyez le code recu"]);
  assert.deepEqual(highlighted(segments), ["Envoyez le code recu"]);
  assert.equal(rejoin(segments), text);
});

test("highlights a quote at the very start", () => {
  const text = "URGENT: payez maintenant.";
  const segments = buildHighlightSegments(text, ["URGENT"]);
  assert.deepEqual(highlighted(segments), ["URGENT"]);
  assert.equal(rejoin(segments), text);
});

test("highlights a quote at the very end", () => {
  const text = "Confirmez: https://bit.ly/xyz";
  const segments = buildHighlightSegments(text, ["https://bit.ly/xyz"]);
  assert.deepEqual(highlighted(segments), ["https://bit.ly/xyz"]);
  assert.equal(rejoin(segments), text);
});

test("highlights every occurrence of a repeated quote", () => {
  const text = "urgent maintenant, vraiment urgent";
  const segments = buildHighlightSegments(text, ["urgent"]);
  assert.deepEqual(highlighted(segments), ["urgent", "urgent"]);
  assert.equal(rejoin(segments), text);
});

test("ignores a paraphrase that is not in the message", () => {
  // This is the exact failure mode the test grid warns about: the model returns
  // a concept instead of an excerpt, and nothing must be highlighted.
  const text = "Envoyez le code recu pour annuler.";
  const segments = buildHighlightSegments(text, [
    "Demande d'authentification",
  ]);
  assert.deepEqual(highlighted(segments), []);
  assert.equal(rejoin(segments), text);
});

test("keeps the valid quotes when one of them is a paraphrase", () => {
  const text = "Alerte: envoyez le code recu pour annuler.";
  const segments = buildHighlightSegments(text, [
    "Demande d'authentification",
    "envoyez le code recu",
  ]);
  assert.deepEqual(highlighted(segments), ["envoyez le code recu"]);
  assert.equal(rejoin(segments), text);
});

test("merges overlapping quotes without duplicating text", () => {
  const text = "Envoyez le code recu maintenant.";
  const segments = buildHighlightSegments(text, [
    "Envoyez le code recu",
    "le code recu maintenant",
  ]);
  assert.equal(rejoin(segments), text);
  assert.equal(highlighted(segments).length, 1);
  assert.equal(highlighted(segments)[0], "Envoyez le code recu maintenant");
});

test("merges a quote nested inside another", () => {
  const text = "Payez 450 EUR immediatement.";
  const segments = buildHighlightSegments(text, ["450 EUR", "Payez 450 EUR"]);
  assert.equal(rejoin(segments), text);
  assert.deepEqual(highlighted(segments), ["Payez 450 EUR"]);
});

test("handles several distinct quotes in order", () => {
  const text = "DHL: colis bloque. Confirmez ici: https://bit.ly/xyz";
  const segments = buildHighlightSegments(text, ["DHL", "https://bit.ly/xyz"]);
  assert.deepEqual(highlighted(segments), ["DHL", "https://bit.ly/xyz"]);
  assert.equal(rejoin(segments), text);
});

test("ignores quotes that are too short to be meaningful", () => {
  const segments = buildHighlightSegments("Bonjour tout le monde", ["a"]);
  assert.deepEqual(highlighted(segments), []);
});

test("handles an empty message", () => {
  assert.deepEqual(buildHighlightSegments("", ["test"]), []);
  assert.deepEqual(buildHighlightSegments(null, ["test"]), []);
});

test("handles a non-array quotes argument", () => {
  const text = "Bonjour";
  const segments = buildHighlightSegments(text, null);
  assert.equal(rejoin(segments), text);
  assert.deepEqual(highlighted(segments), []);
});

test("is case sensitive, matching the model's word-for-word requirement", () => {
  const text = "Envoyez le code recu";
  const segments = buildHighlightSegments(text, ["envoyez le code"]);
  assert.deepEqual(highlighted(segments), []);
});
