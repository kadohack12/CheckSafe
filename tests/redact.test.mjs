/**
 * Redaction tests.
 *
 * Run with: npm test
 *
 * Two properties matter, and they pull against each other:
 *   1. Personal data must be removed before the message leaves the browser.
 *   2. Scam signal must survive. Over-redaction is a safety bug too: masking
 *      "24h" or "6-digit code" would blind the analyser to the very pattern
 *      that makes the message dangerous.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { redactSensitiveData } from "../lib/redact.js";

test("masks an email address", () => {
  const { text, labels } = redactSensitiveData(
    "Contact me at jean.dupont@example.com now",
  );
  assert.ok(!text.includes("jean.dupont@example.com"));
  assert.ok(text.includes("[EMAIL]"));
  assert.deepEqual(labels, ["email address"]);
});

test("masks an IBAN", () => {
  const { text } = redactSensitiveData(
    "Transfer to FR76 3000 6000 0112 3456 7890 189 today",
  );
  assert.ok(!text.includes("FR76"));
  assert.ok(text.includes("[IBAN]"));
});

test("masks a French phone number with separators", () => {
  const { text } = redactSensitiveData("Call 06 12 34 56 78 right now");
  assert.ok(!text.includes("06 12 34 56 78"));
  assert.ok(text.includes("[PHONE]"));
});

test("masks an international phone number", () => {
  const { text } = redactSensitiveData("Call +33 6 12 34 56 78 immediately");
  assert.ok(!text.includes("+33"));
  assert.ok(text.includes("[PHONE]"));
});

test("masks a US phone number", () => {
  const { text } = redactSensitiveData("Call (555) 123-4567 today");
  assert.ok(!text.includes("555) 123-4567"));
  assert.ok(text.includes("[PHONE]"));
});

test("masks a card number", () => {
  const { text } = redactSensitiveData("Your card 4539 1488 0343 6467 was used");
  assert.ok(!text.includes("4539"));
  assert.ok(text.includes("[CARD]"));
});

test("masks an amount written with a currency suffix", () => {
  const { text } = redactSensitiveData("A payment of 2,99 EUR is required");
  assert.ok(!text.includes("2,99"));
  assert.ok(text.includes("[AMOUNT]"));
});

test("masks an amount written with a currency symbol", () => {
  const { text } = redactSensitiveData("Please pay €2.99 now");
  assert.ok(!text.includes("2.99"));
  assert.ok(text.includes("[AMOUNT]"));
});

test("keeps scam signal: deadlines and code lengths are not personal data", () => {
  const { text, total } = redactSensitiveData(
    "Pay within 24h and confirm your 6-digit code",
  );
  assert.ok(text.includes("24h"));
  assert.ok(text.includes("6-digit"));
  assert.equal(total, 0);
});

test("keeps years, times and percentages intact", () => {
  const { text } = redactSensitiveData(
    "Since 2019 we deliver 100% free, call at 14:30",
  );
  assert.ok(text.includes("2019"));
  assert.ok(text.includes("100%"));
  assert.ok(text.includes("14:30"));
});

test("handles an empty string", () => {
  const { text, total, labels } = redactSensitiveData("");
  assert.equal(text, "");
  assert.equal(total, 0);
  assert.deepEqual(labels, []);
});

test("handles a non-string input without throwing", () => {
  assert.equal(redactSensitiveData(null).total, 0);
  assert.equal(redactSensitiveData(undefined).total, 0);
  assert.equal(redactSensitiveData(42).total, 0);
});

test("masks several kinds of data in one message", () => {
  const { text, total, labels } = redactSensitiveData(
    "Write to jean@example.com, call 06 12 34 56 78, a 480 € fee applies",
  );
  assert.ok(!text.includes("jean@example.com"));
  assert.ok(!text.includes("480"));
  assert.ok(total >= 3);
  assert.ok(labels.includes("email address"));
  assert.ok(labels.includes("phone number"));
  assert.ok(labels.includes("amount"));
});

test("a realistic bank scam keeps its danger signal after redaction", () => {
  const { text } = redactSensitiveData(
    "URGENT: an unusual transaction of 480 EUR was detected. " +
      "Call +33 6 12 34 56 78 and confirm your 6-digit code within 30 minutes.",
  );
  // Personal and financial identifiers are gone.
  assert.ok(!text.includes("+33"));
  assert.ok(!text.includes("480"));
  // The manipulation techniques remain, so the analyser can still work.
  assert.ok(text.includes("URGENT"));
  assert.ok(text.includes("6-digit"));
  assert.ok(text.includes("30 minutes"));
});

test("a realistic delivery scam keeps its danger signal after redaction", () => {
  const { text } = redactSensitiveData(
    "Your parcel is held at customs. Pay a 2,99 EUR fee at " +
      "parcel-pay-secure.com within 24h or it is returned to sender.",
  );
  assert.ok(!text.includes("2,99"));
  assert.ok(text.includes("parcel-pay-secure.com"));
  assert.ok(text.includes("24h"));
});
