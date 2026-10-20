/**
 * Builds the message a user can forward to a relative.
 *
 * The point is to make it trivially easy for someone to warn a person they
 * care about, in the channel that person actually uses. So the text has to be
 * short, readable on a phone lock screen, and lead with the verdict.
 */

import { SITE_URL } from "./constants.js";

const VERDICT_LABELS = {
  Low: "looks safe",
  Suspicious: "looks suspicious",
  "Very dangerous": "looks very dangerous",
  Undetermined: "could not be assessed",
};

const VERDICT_EMOJI = {
  Low: "🟢",
  Suspicious: "🟠",
  "Very dangerous": "🔴",
  Undetermined: "⚪",
};

/**
 * @param {{ risk_level?: string, summary?: string, recommended_actions?: string[] }} result
 * @returns {string} the text to prefill in WhatsApp or an SMS
 */
export function buildShareText(result) {
  if (!result || typeof result !== "object") return "";

  const level = VERDICT_LABELS[result.risk_level] ? result.risk_level : "Undetermined";
  const emoji = VERDICT_EMOJI[level];
  const lines = [
    `${emoji} I checked a message with CheckSafe: it ${VERDICT_LABELS[level]}.`,
  ];

  if (typeof result.summary === "string" && result.summary.trim()) {
    lines.push("", result.summary.trim());
  }

  const action = (result.recommended_actions || []).find(
    (item) => typeof item === "string" && item.trim(),
  );
  if (action) {
    lines.push("", `What to do: ${action.trim()}`);
  }

  lines.push(
    "",
    "If you get a message like this, check it before you reply or pay:",
    SITE_URL,
  );

  return lines.join("\n");
}

/** WhatsApp deep link with the text prefilled. */
export function buildWhatsAppLink(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * SMS link. The `?body=` form is the widely supported one; some platforms
 * ignore the body parameter entirely, which is why the copy button remains
 * available as a fallback.
 */
export function buildSmsLink(text) {
  return `sms:?body=${encodeURIComponent(text)}`;
}
