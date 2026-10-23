/** Constants shared between the browser bundle and the server. */

export const MAX_MESSAGE_LENGTH = 4000;

/**
 * Single source of truth for the response contract between API and UI.
 *
 * The route builds its payload by picking these fields, so anything a provider
 * or the rules engine returns beyond this list (internal bookkeeping such as
 * `matched_rules`) never reaches the client.
 */
export const RESPONSE_FIELDS = [
  "risk_level",
  "summary",
  "detected_traps",
  "trap_quotes",
  "recommended_actions",
  "reassurance",
  "official_safe_url",
  "defanged_text",
];

/** Public URL, used to build the "share with a loved one" message and SEO. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://check-safe-beryl.vercel.app";

/**
 * SEO metadata, kept here so the page metadata, the structured data and the
 * social cards all describe the site the same way.
 */
export const SITE_NAME = "CheckSafe";

export const SITE_TITLE =
  "CheckSafe — Scam & phishing message checker";

export const SITE_DESCRIPTION =
  "Paste a suspicious SMS, email or WhatsApp message and CheckSafe tells you, in plain language, whether it is a scam. Free, no account needed, and your personal data is masked in the browser before anything is analysed.";

export const SITE_KEYWORDS = [
  "scam checker",
  "phishing checker",
  "is this a scam",
  "sms scam",
  "smishing",
  "phishing email",
  "fake invoice",
  "fake refund",
  "whatsapp scam",
  "social engineering",
  "fraud detection",
  "online safety",
  "digital safety",
  "CheckSafe",
];

export const SITE_LOCALE = "en_US";

export const SITE_LANG = "en";

/**
 * FAQ shown on the page and mirrored in the FAQPage structured data, so the
 * visible content and the markup can never drift apart.
 */
export const FAQ_ITEMS = [
  {
    question: "How do I check if a text message is a scam?",
    answer:
      "Paste the message into CheckSafe. It reads the wording for social-engineering patterns, such as artificial urgency, brand impersonation and payment requests on unofficial domains, then returns a plain-language verdict with the exact excerpts that triggered it.",
  },
  {
    question: "Does CheckSafe store my messages?",
    answer:
      "No. Phone numbers, email addresses, bank details and card numbers are masked in your browser before the message is sent, and the message is not stored.",
  },
  {
    question: "Is CheckSafe free?",
    answer: "Yes, CheckSafe is free to use and needs no account.",
  },
];
