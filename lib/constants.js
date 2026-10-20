/** Constants shared between the browser bundle and the server. */

export const MAX_MESSAGE_LENGTH = 4000;

/** Single source of truth for the response contract between API and UI. */
export const RESPONSE_FIELDS = [
  "risk_level",
  "summary",
  "detected_traps",
  "recommended_actions",
  "reassurance",
];
