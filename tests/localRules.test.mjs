/**
 * Local rules engine tests.
 *
 * The engine is the last line of defence when no AI provider is reachable, so
 * these tests are the specification of what the app promises offline. They also
 * pin the safety floor: the four reference cases must keep their verdict even
 * with no model involved.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeLocally,
  detectLanguage,
  escalateRiskLevel,
} from "../lib/localRules.js";

// The four reference cases from the test grid.
const CASE_DELIVERY = "DHL: Votre colis n'a pas pu etre livre. Confirmez: https://bit.ly/xyz";
const CASE_BANK =
  "Alerte Securite : Paiement suspect de 450EUR. Envoyez le code recu pour annuler.";
const CASE_EMOTIONAL =
  "Coucou c'est moi, nouveau numero, mon tel est casse, depanne-moi de 50EUR urgent";
const CASE_LEGITIMATE =
  "Salut, n'oublie pas le pain en rentrant ce soir. A tout a l'heure !";

test("case 1 (fake parcel with shortened link) is Very dangerous offline", () => {
  const result = analyzeLocally(CASE_DELIVERY);
  assert.equal(result.risk_level, "Very dangerous");
  assert.ok(result.matched_rules.includes("shortened_link_lure"));
});

test("case 2 (bank asking for the code) is Very dangerous offline", () => {
  const result = analyzeLocally(CASE_BANK);
  assert.equal(result.risk_level, "Very dangerous");
  assert.ok(result.matched_rules.includes("credential_request"));
});

test("case 3 (money request from a new number) is Suspicious offline", () => {
  const result = analyzeLocally(CASE_EMOTIONAL);
  assert.equal(result.risk_level, "Suspicious");
});

test("case 4 (ordinary message) is never reported as safe", () => {
  // The rules engine can recognise danger, but it cannot certify safety. The
  // honest offline answer for an unknown message is Undetermined.
  const result = analyzeLocally(CASE_LEGITIMATE);
  assert.equal(result.risk_level, "Undetermined");
  assert.deepEqual(result.matched_rules, []);
});

test("the rules engine never returns Low", () => {
  const messages = [
    CASE_DELIVERY,
    CASE_BANK,
    CASE_EMOTIONAL,
    CASE_LEGITIMATE,
    "",
    "hello",
    "Your invoice is attached.",
  ];
  for (const message of messages) {
    assert.notEqual(analyzeLocally(message).risk_level, "Low", message);
  }
});

test("gift card and crypto payment is Very dangerous", () => {
  const result = analyzeLocally(
    "Pour liberer votre colis, achetez une carte cadeau PCS de 200EUR et envoyez le code.",
  );
  assert.equal(result.risk_level, "Very dangerous");
  assert.ok(result.matched_rules.includes("gift_card_payment"));
});

test("a blocked account with urgency is Very dangerous", () => {
  const result = analyzeLocally(
    "Votre compte bancaire est bloque. Agissez immediatement ou il sera cloture.",
  );
  assert.equal(result.risk_level, "Very dangerous");
});

test("English scam wording is detected too", () => {
  const result = analyzeLocally(
    "URGENT: your account is blocked. Confirm your password now at http://secure-verify.top",
  );
  assert.equal(result.risk_level, "Very dangerous");
});

test("a legitimate message mentioning a parcel is not flagged", () => {
  const result = analyzeLocally(
    "Bonjour, votre colis sera livre demain entre 9h et 12h. Bonne journee.",
  );
  assert.notEqual(result.risk_level, "Very dangerous");
});

test("quotes come from the message itself, never invented", () => {
  const result = analyzeLocally(CASE_BANK);
  assert.ok(result.trap_quotes.length > 0);
  for (const quote of result.trap_quotes) {
    assert.ok(
      CASE_BANK.includes(quote),
      `quote not found in the message: ${quote}`,
    );
  }
});

test("the parcel case quotes the shortened link exactly", () => {
  const result = analyzeLocally(CASE_DELIVERY);
  assert.ok(result.trap_quotes.includes("https://bit.ly/xyz"));
});

test("offline output matches the response contract", () => {
  const result = analyzeLocally(CASE_DELIVERY);
  assert.equal(typeof result.summary, "string");
  assert.ok(Array.isArray(result.detected_traps));
  assert.ok(Array.isArray(result.recommended_actions));
  assert.ok(result.recommended_actions.length >= 2);
  assert.equal(typeof result.reassurance, "string");
});

test("offline recommendations use plain, imperative wording", () => {
  const result = analyzeLocally(CASE_BANK);
  const banned = /spoofing|dns|man-in-the-middle|canonical|payload|ioc/i;
  for (const action of result.recommended_actions) {
    assert.ok(!banned.test(action), `jargon found: ${action}`);
  }
  assert.ok(
    result.recommended_actions.some((action) =>
      /^(do not|ne |n')/i.test(action),
    ),
  );
});

test("French messages get French prose, English messages English prose", () => {
  const french = analyzeLocally(CASE_DELIVERY);
  const english = analyzeLocally(
    "URGENT: your account is blocked. Confirm your password now at http://x.top",
  );
  assert.match(french.summary, /message/i);
  assert.match(french.recommended_actions[0], /\b(?:ne|n'|contactez|ouvrez)\b/i);
  assert.match(english.recommended_actions[0], /^Do not/i);
});

test("detectLanguage distinguishes French from English", () => {
  assert.equal(detectLanguage(CASE_DELIVERY), "fr");
  assert.equal(detectLanguage("Your parcel could not be delivered"), "en");
});

test("the rules engine is deterministic", () => {
  const runs = Array.from({ length: 5 }, () => analyzeLocally(CASE_DELIVERY));
  for (const run of runs) {
    assert.equal(run.risk_level, runs[0].risk_level);
    assert.deepEqual(run.detected_traps, runs[0].detected_traps);
    assert.deepEqual(run.matched_rules, runs[0].matched_rules);
  }
});

test("escalation raises a lenient model verdict", () => {
  const escalated = escalateRiskLevel("Low", "Very dangerous");
  assert.equal(escalated.risk_level, "Very dangerous");
  assert.equal(escalated.escalated, true);
});

test("escalation never lowers a strict model verdict", () => {
  const kept = escalateRiskLevel("Very dangerous", "Suspicious");
  assert.equal(kept.risk_level, "Very dangerous");
  assert.equal(kept.escalated, false);
});

test("an absent local match never escalates a confident model verdict", () => {
  // Regression: the engine reports Undetermined when no rule matched, which is
  // absence of evidence. It must not outrank the model's "Low", or every
  // innocent message would become a false alarm.
  const low = escalateRiskLevel("Low", "Undetermined");
  assert.equal(low.risk_level, "Low");
  assert.equal(low.escalated, false);

  const suspicious = escalateRiskLevel("Suspicious", "Undetermined");
  assert.equal(suspicious.risk_level, "Suspicious");
  assert.equal(suspicious.escalated, false);
});

test("a positive local match still escalates a lenient model verdict", () => {
  const result = escalateRiskLevel("Low", "Suspicious");
  assert.equal(result.risk_level, "Suspicious");
  assert.equal(result.escalated, true);
});

test("escalation treats an unknown level as Undetermined, not as safe", () => {
  const result = escalateRiskLevel("Banana", "Suspicious");
  assert.equal(result.risk_level, "Suspicious");
});

test("escalation leaves equal verdicts untouched", () => {
  const result = escalateRiskLevel("Suspicious", "Suspicious");
  assert.equal(result.risk_level, "Suspicious");
  assert.equal(result.escalated, false);
});

test("offline output always carries the official_safe_url field", () => {
  for (const message of [CASE_DELIVERY, CASE_BANK, CASE_LEGITIMATE, ""]) {
    const result = analyzeLocally(message);
    assert.ok(
      "official_safe_url" in result,
      `missing official_safe_url for: ${message}`,
    );
  }
});

test("offline mode offers a verified link for an impersonated brand", () => {
  const result = analyzeLocally(CASE_DELIVERY);
  assert.equal(result.official_safe_url.impersonated_brand, "DHL");
  assert.equal(result.official_safe_url.official_url, "https://www.dhl.com");
});

test("offline mode offers no verified link without a known brand", () => {
  const result = analyzeLocally(CASE_LEGITIMATE);
  assert.equal(result.official_safe_url, null);
});

test("offline mode detects a bare domain, without an http prefix", () => {
  const result = analyzeLocally(
    "Your refund is waiting. Confirm your bank details at secure-billing-refunds.com within 48h.",
  );
  assert.equal(result.risk_level, "Suspicious");
  assert.ok(result.matched_rules.includes("refund_lure_link"));
});
