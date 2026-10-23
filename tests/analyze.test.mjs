/**
 * Response-normalisation tests.
 *
 * The model reply is untrusted input: it can be malformed, or try to smuggle a
 * URL of its own into the "verified" button. These tests pin the contract and
 * the trust boundary around `official_safe_url`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeResult } from "../lib/analyze.js";

const base = {
  risk_level: "Very dangerous",
  summary: "This message tries to make you pay a fake fee.",
  detected_traps: [{ label: "Artificial urgency", quote: "within 24h" }],
  recommended_actions: ["Do not click the link.", "Check the official site."],
  reassurance: "You did the right thing by checking.",
};

const MESSAGE = "DHL: pay the fee within 24h at dhl-fee-secure.com or it is returned.";

test("keeps a valid reply and adds a registry-backed safe URL", () => {
  const result = normalizeResult({ ...base }, MESSAGE);
  assert.equal(result.risk_level, "Very dangerous");
  assert.equal(result.official_safe_url.official_url, "https://www.dhl.com");
  assert.equal(result.official_safe_url.impersonated_brand, "DHL");
});

test("discards a model URL and rebuilds it from the registry", () => {
  // The model tries to hand us the scam domain as the "official" one.
  const result = normalizeResult(
    {
      ...base,
      official_safe_url: {
        impersonated_brand: "DHL",
        official_url: "https://dhl-fee-secure.com",
      },
    },
    MESSAGE,
  );
  assert.equal(result.official_safe_url.official_url, "https://www.dhl.com");
  assert.ok(!result.official_safe_url.official_url.includes("secure"));
});

test("sets official_safe_url to null when no brand is recognised", () => {
  const result = normalizeResult(
    { ...base, official_safe_url: null },
    "Your account is blocked. Confirm at tinybank-verify.top now.",
  );
  assert.equal(result.official_safe_url, null);
});

test("accepts a model-proposed brand but never its URL", () => {
  const result = normalizeResult(
    {
      ...base,
      official_safe_url: {
        impersonated_brand: "PayPal",
        official_url: "https://paypal-secure-login.top",
      },
    },
    "Your PayPal account has been limited.",
  );
  assert.equal(result.official_safe_url.official_url, "https://www.paypal.com");
});

test("official_safe_url is always present in the normalised result", () => {
  const result = normalizeResult({ ...base }, "An ordinary message.");
  assert.ok("official_safe_url" in result);
});

test("rejects a reply with an unknown risk level", () => {
  assert.equal(normalizeResult({ ...base, risk_level: "Fine" }, MESSAGE), null);
});

test("rejects a reply missing its reassurance", () => {
  const { reassurance, ...withoutReassurance } = base;
  assert.equal(normalizeResult(withoutReassurance, MESSAGE), null);
});

test("rejects a reply with no usable action", () => {
  assert.equal(
    normalizeResult({ ...base, recommended_actions: [] }, MESSAGE),
    null,
  );
});
