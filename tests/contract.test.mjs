/**
 * Response-contract tests.
 *
 * The route builds its public payload from RESPONSE_FIELDS rather than
 * spreading the engine result. That boundary is what keeps internal
 * bookkeeping (matched_rules) out of the API response, so it is pinned here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { RESPONSE_FIELDS } from "../lib/constants.js";
import { buildPublicResult } from "../lib/analyze.js";

const ENGINE_RESULT = {
  risk_level: "Very dangerous",
  summary: "This message shows the specific signs of a known scam.",
  detected_traps: ["Parcel notice with a link to click"],
  trap_quotes: ["dhl-fee-secure.com", "a quote that is not in the message"],
  recommended_actions: ["Do not click any link."],
  reassurance: "You did the right thing by checking.",
  official_safe_url: { impersonated_brand: "DHL", official_url: "https://www.dhl.com" },
  // Internal bookkeeping the rules engine returns; must never reach the client.
  matched_rules: ["delivery_with_link"],
};

const MESSAGE = "DHL: pay 2.99 EUR at dhl-fee-secure.com";

test("every documented field is present in the public payload", () => {
  const payload = buildPublicResult(ENGINE_RESULT, MESSAGE);
  for (const field of RESPONSE_FIELDS) {
    assert.ok(field in payload, `missing ${field} in the public payload`);
  }
});

test("internal bookkeeping does not leak into the public payload", () => {
  const payload = buildPublicResult(ENGINE_RESULT, MESSAGE);
  assert.equal("matched_rules" in payload, false);
});

test("defanged_text is generated from the redacted message", () => {
  const payload = buildPublicResult(ENGINE_RESULT, MESSAGE);
  assert.equal(payload.defanged_text, "DHL: pay 2.99 EUR at dhl-fee-secure[.]com");
});

test("trap quotes that are not in the message are dropped", () => {
  const payload = buildPublicResult(ENGINE_RESULT, MESSAGE);
  assert.deepEqual(payload.trap_quotes, ["dhl-fee-secure.com"]);
});

test("an unexpected extra field is not forwarded", () => {
  const payload = buildPublicResult(
    { ...ENGINE_RESULT, secret_debug: "do not ship this" },
    MESSAGE,
  );
  assert.equal("secret_debug" in payload, false);
});
