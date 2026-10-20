/**
 * Local rules engine.
 *
 * Two jobs, both about not depending on a language model:
 *
 *   1. Fallback. When every AI provider is down, the app must still answer
 *      usefully for obvious scams instead of shrugging. A message asking for a
 *      verification code is dangerous whether or not an API is reachable.
 *
 *   2. Safety floor. A known high-confidence scam signature must never be
 *      downgraded by a model's probabilistic judgement. Rules only ever raise
 *      a verdict, never lower it.
 *
 * Design constraints:
 *   - Pure and synchronous: same input, same output, always.
 *   - Bilingual (French and English), because the app replies in the language
 *     of the message it was given.
 *   - High precision. A rule that fires on innocent messages is worse than no
 *     rule at all, so each one requires several signals to co-occur.
 *   - It never returns "Low". A rule engine cannot certify that a message is
 *     safe, only that it recognises a danger pattern. Absence of a match is
 *     reported as "Undetermined", which is the honest answer.
 */

/** Severity ordering. "Undetermined" sits above "Low": unknown is not safe. */
const RANK = { Low: 0, Undetermined: 1, Suspicious: 2, "Very dangerous": 3 };

const PATTERNS = {
  link: /(?:https?:\/\/|www\.)\S+/i,
  shortenedLink:
    /\b(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|goo\.gl|rb\.gy|ow\.ly|shorturl\.at|rebrand\.ly|s\.id|tiny\.cc|linktr\.ee)\b/i,
  codeRequest:
    /\b(?:code|pin|mot de passe|password|otp|code de validation|code secret|code recu|code reçu)\b/i,
  sendVerb:
    /\b(?:envoy|envoie|envoyez|transmett|transmettez|communiqu|communiquez|confirmez|confirmer|indiquez|send|share|give|provide|confirm|reply with|repondez|répondez)\b/i,
  payment:
    /\b(?:paiement|payez|payer|virement|versement|regler|régler|frais|supplement|supplément|fee|payment|pay|transfer|acompte|solde)\b/i,
  delivery:
    /\b(?:colis|livraison|livreur|chronopost|dhl|dpd|ups|fedex|la poste|mondial relay|parcel|package|delivery|courier|shipment|relais)\b/i,
  bank: /\b(?:compte|bancaire|banque|bank|account|card|carte|cb|credit|débit|debit|solde)\b/i,
  urgency:
    /\b(?:urgent|urgence|immediatement|immédiatement|maintenant|sous 24h|sous 48h|dans l'heure|dernier avertissement|expire|expiré|bloque|bloqué|suspendu|cloture|clôturé|immediately|right now|within 24h|final notice|last warning|suspended|blocked|annul)\b/i,
  moneyRequest:
    /\b(?:depanne|dépanne|depanner|dépanner|prete|prête|pret|prêt|envoie moi|envoie-moi|vire|send me|lend me|transfer me)\b/i,
  newNumber:
    /\b(?:nouveau numero|nouveau numéro|new number|j'ai change de numero|j'ai changé de numéro|mon tel est casse|mon téléphone est cassé|my phone is broken|tel casse|téléphone cassé)\b/i,
  giftCard:
    /\b(?:carte cadeau|cartes cadeau|gift card|pcs|transcash|neosurf|bitcoin|crypto|usdt|western union|moneygram)\b/i,
  credentials:
    /\b(?:identifiant|mot de passe|login|password|code confidentiel|3 derniers chiffres|cvv|cryptogramme)\b/i,
  refundLure:
    /\b(?:remboursement|refund|trop percu|trop perçu|impaye|impayé|amende|contravention|tva|taxe)\b/i,
  brand:
    /\b(?:dhl|chronopost|dpd|ups|fedex|la poste|amazon|netflix|paypal|impots|impôts|cpam|ameli|amélie|microsoft|apple|google|orange|sfr|bouygues|mtn|orange money|wave)\b/i,
  accountBlocked:
    /\b(?:bloque|bloqué|suspendu|cloture|clôturé|resilie|résilié|desactive|désactivé|blocked|suspended|closed|deactivated)\b/i,
};

/**
 * Rules are ordered by severity; the highest match wins. Each returns a label
 * and, where possible, the exact substring from the message so the interface
 * can highlight it without guessing.
 */
const RULES = [
  {
    id: "credential_request",
    level: "Very dangerous",
    label: {
      fr: "Demande de code ou de mot de passe",
      en: "Request for a secret code or password",
    },
    test: (text) => PATTERNS.codeRequest.test(text) && PATTERNS.sendVerb.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.codeRequest),
  },
  {
    id: "gift_card_payment",
    level: "Very dangerous",
    label: {
      fr: "Paiement par carte cadeau ou cryptomonnaie",
      en: "Payment by gift card or cryptocurrency",
    },
    test: (text) => PATTERNS.giftCard.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.giftCard),
  },
  {
    id: "shortened_link_lure",
    level: "Very dangerous",
    label: {
      fr: "Lien raccourci masquant la vraie adresse",
      en: "Shortened link hiding the real address",
    },
    test: (text) =>
      PATTERNS.shortenedLink.test(text) &&
      (PATTERNS.delivery.test(text) ||
        PATTERNS.payment.test(text) ||
        PATTERNS.bank.test(text) ||
        PATTERNS.refundLure.test(text) ||
        PATTERNS.credentials.test(text) ||
        PATTERNS.accountBlocked.test(text)),
    quote: (text) => matchLink(text),
  },
  {
    id: "payment_with_link",
    level: "Very dangerous",
    label: {
      fr: "Paiement demande via un lien",
      en: "Payment requested through a link",
    },
    test: (text) =>
      PATTERNS.payment.test(text) &&
      PATTERNS.link.test(text) &&
      (PATTERNS.urgency.test(text) || PATTERNS.brand.test(text)),
    quote: (text) => matchLink(text),
  },
  {
    id: "bank_urgency_action",
    level: "Very dangerous",
    label: {
      fr: "Compte bancaire bloque et action immediate exigee",
      en: "Blocked bank account with an immediate action demanded",
    },
    test: (text) =>
      PATTERNS.bank.test(text) &&
      PATTERNS.accountBlocked.test(text) &&
      (PATTERNS.urgency.test(text) || PATTERNS.sendVerb.test(text)),
    quote: (text) => matchPhrase(text, PATTERNS.accountBlocked),
  },
  {
    id: "money_request_new_number",
    level: "Suspicious",
    label: {
      fr: "Demande d'argent sur un nouveau numero",
      en: "Money request from a new number",
    },
    test: (text) =>
      PATTERNS.moneyRequest.test(text) &&
      (PATTERNS.newNumber.test(text) || PATTERNS.urgency.test(text)),
    quote: (text) => matchPhrase(text, PATTERNS.moneyRequest),
  },
  {
    id: "delivery_with_link",
    level: "Suspicious",
    label: {
      fr: "Colis annonce avec un lien a cliquer",
      en: "Parcel notice with a link to click",
    },
    test: (text) => PATTERNS.delivery.test(text) && PATTERNS.link.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.delivery),
  },
  {
    id: "credentials_with_link",
    level: "Very dangerous",
    label: {
      fr: "Identifiants demandes via un lien",
      en: "Login details requested through a link",
    },
    test: (text) => PATTERNS.credentials.test(text) && PATTERNS.link.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.credentials),
  },
  {
    id: "urgency_brand_pressure",
    level: "Suspicious",
    label: {
      fr: "Marque imitee avec pression au temps",
      en: "Brand impersonation with time pressure",
    },
    test: (text) => PATTERNS.brand.test(text) && PATTERNS.urgency.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.brand),
  },
  {
    id: "refund_lure_link",
    level: "Suspicious",
    label: {
      fr: "Remboursement ou amende annonces avec un lien",
      en: "Refund or fine announced with a link",
    },
    test: (text) => PATTERNS.refundLure.test(text) && PATTERNS.link.test(text),
    quote: (text) => matchPhrase(text, PATTERNS.refundLure),
  },
];

/** Returns the matched substring itself, so the UI can highlight it exactly. */
function matchPhrase(text, pattern) {
  const match = text.match(pattern);
  return match ? match[0] : null;
}

/**
 * For link rules, prefer the whole link over the bare domain: "https://bit.ly/xyz"
 * is far more informative to highlight than "bit.ly".
 */
function matchLink(text) {
  const links = text.match(/(?:https?:\/\/|www\.)\S+/gi);
  if (!links) return matchPhrase(text, PATTERNS.shortenedLink);
  const shortened = links.find((link) => PATTERNS.shortenedLink.test(link));
  return shortened || links[0];
}

/** Rough French detection. Only used to pick the wording of our own prose. */
export function detectLanguage(text) {
  if (typeof text !== "string") return "en";
  const frenchHints =
    /[àâäéèêëîïôöùûüç]|\b(?:le|la|les|des|votre|nous|vous|est|pas|pour|avec|sur|une|un|mon|ma|mes|ce|cette|je|tu|il|elle|et|ou|de|du|au|aux)\b/i;
  return frenchHints.test(text) ? "fr" : "en";
}

/**
 * Evaluates the local rules against a message.
 *
 * @param {string} message
 * @returns {{
 *   risk_level: string,
 *   summary: string,
 *   detected_traps: string[],
 *   trap_quotes: string[],
 *   recommended_actions: string[],
 *   reassurance: string,
 *   matched_rules: string[],
 * }}
 */
export function analyzeLocally(message) {
  const text = typeof message === "string" ? message : "";
  const language = detectLanguage(text);

  const hits = [];
  for (const rule of RULES) {
    if (!rule.test(text)) continue;
    const quote = rule.quote ? rule.quote(text) : null;
    hits.push({
      id: rule.id,
      level: rule.level,
      label: rule.label[language],
      quote: quote && text.includes(quote) ? quote : null,
    });
  }

  if (hits.length === 0) {
    return {
      risk_level: "Undetermined",
      summary:
        language === "fr"
          ? "Nos services d'analyse sont indisponibles et ce message ne correspond a aucun signal d'arnaque connu."
          : "Our analysis services are unavailable, and this message does not match any known scam signal.",
      detected_traps: [],
      trap_quotes: [],
      recommended_actions:
        language === "fr"
          ? [
              "Ne cliquez sur aucun lien et n'envoyez aucun code ni mot de passe.",
              "Verifiez l'information directement sur le site ou l'application officielle.",
              "En cas de doute, ne faites rien et reessayez plus tard.",
            ]
          : [
              "Do not click any link and do not send any code or password.",
              "Check the information directly on the official website or app.",
              "If in doubt, do nothing and try again later.",
            ],
      reassurance:
        language === "fr"
          ? "Pas d'inquietude : ne rien faire en cas de doute reste le bon reflexe."
          : "No worries: doing nothing when in doubt is always the right reflex.",
      matched_rules: [],
    };
  }

  const level = hits.reduce(
    (worst, hit) => (RANK[hit.level] > RANK[worst] ? hit.level : worst),
    "Low",
  );

  const summaryByLevel = {
    fr: {
      "Very dangerous":
        "Ce message presente les signes precis d'une arnaque connue. Ne repondez pas et ne payez rien.",
      Suspicious:
        "Ce message presente plusieurs signes suspects. La prudence est de rigueur.",
    },
    en: {
      "Very dangerous":
        "This message shows the specific signs of a known scam. Do not reply and do not pay anything.",
      Suspicious:
        "This message shows several suspicious signs. Caution is warranted.",
    },
  };

  return {
    risk_level: level,
    summary: summaryByLevel[language][level],
    detected_traps: hits.map((hit) => hit.label),
    trap_quotes: hits.map((hit) => hit.quote).filter(Boolean),
    recommended_actions:
      level === "Very dangerous"
        ? language === "fr"
          ? [
              "Ne cliquez sur aucun lien et n'envoyez aucun code.",
              "Ne payez rien et n'appelez pas le numero indique.",
              "Contactez l'organisme via son application ou son site officiel.",
            ]
          : [
              "Do not click any link and do not send any code.",
              "Do not pay anything and do not call the number in the message.",
              "Contact the organisation through its official app or website.",
            ]
        : language === "fr"
          ? [
              "Ne repondez pas et n'envoyez pas d'argent.",
              "Appelez la personne sur son ancien numero pour verifier.",
              "Signalez le message a votre entourage.",
            ]
          : [
              "Do not reply and do not send any money.",
              "Call the person on their previous number to check.",
              "Warn the people around you about this message.",
            ],
    reassurance:
      language === "fr"
        ? "Vous avez bien fait de verifier avant d'agir, c'est exactement le bon reflexe."
        : "You did the right thing by checking before acting. That is exactly the right reflex.",
    matched_rules: hits.map((hit) => hit.id),
  };
}

/**
 * Raises a model verdict to the local rule verdict when the rules are stricter.
 * A known scam signature must never be talked down by a model.
 *
 * @returns {{ risk_level: string, escalated: boolean, matched_rules: string[] }}
 */
export function escalateRiskLevel(modelLevel, localLevel) {
  const modelRank = RANK[modelLevel] ?? RANK.Undetermined;
  const localRank = RANK[localLevel] ?? RANK.Undetermined;
  return {
    risk_level: localRank > modelRank ? localLevel : modelLevel,
    escalated: localRank > modelRank,
  };
}
