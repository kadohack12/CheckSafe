/**
 * Verified-portal tests.
 *
 * The safe link is the one place where we send a user to a URL, so these tests
 * pin the security property that matters: the URL we show is always rebuilt
 * from our own registry, and a URL coming from the message or the model is
 * never trusted.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfficialSafeUrl,
  findOfficialSite,
  findSiteByBrandName,
  isTrustedOfficialUrl,
  resolveOfficialSafeUrl,
} from "../lib/officialSites.js";

test("recognises a brand named in a message", () => {
  const site = findOfficialSite("DHL: votre colis est en attente.");
  assert.equal(site?.id, "dhl");
  assert.equal(site?.officialUrl, "https://www.dhl.com");
});

test("recognises a brand regardless of case", () => {
  assert.equal(findOfficialSite("Votre compte NETFLIX a ete suspendu.")?.id, "netflix");
  assert.equal(findOfficialSite("your paypal account")?.id, "paypal");
});

test("recognises a brand with a space, like Mondial Relay", () => {
  assert.equal(findOfficialSite("Livraison Mondial Relay en attente")?.id, "mondialrelay");
});

test("returns null when no registered brand is mentioned", () => {
  assert.equal(findOfficialSite("Bonjour, n'oublie pas le pain ce soir."), null);
  assert.equal(findOfficialSite(""), null);
  assert.equal(findOfficialSite(null), null);
});

test("maps a model-proposed brand name back to the registry", () => {
  assert.equal(findSiteByBrandName("DHL")?.id, "dhl");
  assert.equal(findSiteByBrandName("PayPal")?.id, "paypal");
  assert.equal(findSiteByBrandName("an unknown brand"), null);
});

test("builds the safe URL from the registry, not from the input", () => {
  const site = findOfficialSite("Amazon");
  const safe = buildOfficialSafeUrl(site);
  assert.deepEqual(safe, {
    impersonated_brand: "Amazon",
    official_url: "https://www.amazon.com",
  });
});

test("accepts a registry URL as trusted", () => {
  assert.equal(isTrustedOfficialUrl("https://www.dhl.com"), true);
  assert.equal(isTrustedOfficialUrl("https://www.dhl.com/tracking"), true);
});

test("rejects a URL that only looks like an official one", () => {
  // The whole point: an attacker domain must never pass the trust check.
  assert.equal(isTrustedOfficialUrl("https://dhl-tracking.top"), false);
  assert.equal(isTrustedOfficialUrl("http://secure-billing-refunds.com"), false);
  assert.equal(isTrustedOfficialUrl("https://dhl.com.evil.top"), false);
  assert.equal(isTrustedOfficialUrl("not a url"), false);
  assert.equal(isTrustedOfficialUrl(""), false);
});

test("resolves a safe URL when a registered brand is impersonated with a link", () => {
  const safe = resolveOfficialSafeUrl({
    text: "DHL: pay 2.99 EUR at dhl-fee-secure.com within 24h.",
    riskLevel: "Very dangerous",
    hasLink: true,
  });
  assert.equal(safe.impersonated_brand, "DHL");
  assert.equal(safe.official_url, "https://www.dhl.com");
});

test("a model-proposed brand is honoured but its URL is discarded", () => {
  const safe = resolveOfficialSafeUrl({
    text: "Your account needs attention.",
    brandName: "Netflix",
    riskLevel: "Suspicious",
    hasLink: false,
  });
  assert.equal(safe.impersonated_brand, "Netflix");
  assert.equal(safe.official_url, "https://www.netflix.com");
});

test("does not invent a safe URL for an unregistered brand", () => {
  const safe = resolveOfficialSafeUrl({
    text: "Your TinyBank account is blocked, confirm at tinybank-verify.top",
    brandName: "TinyBank",
    riskLevel: "Very dangerous",
    hasLink: true,
  });
  assert.equal(safe, null);
});

test("no safe URL when a legitimate message merely names a brand", () => {
  // "your Amazon order shipped" is not impersonation and needs no rescue link.
  const safe = resolveOfficialSafeUrl({
    text: "Your Amazon order has shipped.",
    riskLevel: "Low",
    hasLink: false,
  });
  assert.equal(safe, null);
});

test("no safe URL for a plain message with no brand at all", () => {
  const safe = resolveOfficialSafeUrl({
    text: "Bonjour, n'oublie pas le pain ce soir.",
    riskLevel: "Low",
    hasLink: false,
  });
  assert.equal(safe, null);
});
