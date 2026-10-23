/**
 * Share-message tests.
 *
 * The shared text is the artefact a user sends to a relative, so it has to
 * carry the verdict unambiguously and never imply more certainty than we have.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildShareText, buildSmsLink, buildWhatsAppLink } from "../lib/share.js";

const dangerous = {
  risk_level: "Very dangerous",
  summary: "This message tries to make you pay a fake fee.",
  recommended_actions: [
    "Do not click any link in this message.",
    "Check the delivery status on the carrier's official website.",
  ],
};

test("leads with the verdict", () => {
  const text = buildShareText(dangerous);
  assert.ok(text.startsWith("🔴"));
  assert.ok(text.includes("very dangerous"));
});

test("includes the summary and the first action", () => {
  const text = buildShareText(dangerous);
  assert.ok(text.includes("This message tries to make you pay a fake fee."));
  assert.ok(text.includes("Do not click any link in this message."));
});

test("includes the site link so the recipient can check too", () => {
  const text = buildShareText(dangerous);
  assert.ok(text.includes("https://check-safe-beryl.vercel.app"));
});

test("does not leak the second action, keeping the message short", () => {
  const text = buildShareText(dangerous);
  assert.ok(!text.includes("carrier's official website"));
});

test("uses a distinct marker per risk level", () => {
  const markers = ["Low", "Suspicious", "Very dangerous", "Undetermined"].map(
    (risk_level) => buildShareText({ risk_level }).slice(0, 2),
  );
  assert.equal(new Set(markers).size, 4);
});

test("an unknown risk level is presented as undetermined, never as safe", () => {
  const text = buildShareText({ risk_level: "Totally fine", summary: "ok" });
  assert.ok(text.includes("could not be assessed"));
  assert.ok(!text.includes("looks safe"));
});

test("tolerates a minimal result without throwing", () => {
  assert.equal(buildShareText(null), "");
  assert.equal(buildShareText(undefined), "");
  assert.ok(buildShareText({ risk_level: "Low" }).includes("looks safe"));
});

test("WhatsApp link encodes the text", () => {
  const link = buildWhatsAppLink("hello world & more");
  assert.ok(link.startsWith("https://wa.me/?text="));
  assert.ok(!link.includes(" "));
  assert.ok(link.includes("%20"));
});

test("SMS link encodes the text", () => {
  const link = buildSmsLink("hello world");
  assert.ok(link.startsWith("sms:?body="));
  assert.ok(link.includes("%20"));
});

test("includes the verified official site when one was found", () => {
  const text = buildShareText({
    ...dangerous,
    official_safe_url: {
      impersonated_brand: "DHL",
      official_url: "https://www.dhl.com",
    },
  });
  assert.ok(text.includes("Official DHL website: https://www.dhl.com"));
});

test("never forwards an unverified 'official' link", () => {
  // A tampered or hallucinated URL must be dropped from the shared message.
  const text = buildShareText({
    ...dangerous,
    official_safe_url: {
      impersonated_brand: "DHL",
      official_url: "https://dhl-fee-secure.com",
    },
  });
  assert.ok(!text.includes("dhl-fee-secure.com"));
  assert.ok(!text.includes("Official DHL website"));
});

test("omits the official site line when there is none", () => {
  const text = buildShareText({ ...dangerous, official_safe_url: null });
  assert.ok(!text.includes("Official"));
});
