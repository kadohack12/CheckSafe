/**
 * Verified official sites ("Safe Link & Verified Portal").
 *
 * This registry is the ONLY source of URLs we ever present as "official". A URL
 * coming from the analysed message, or even from the language model, is never
 * trusted: a model can hallucinate a domain, and a scam message can try to
 * smuggle its own link in through the prompt. We therefore match the brand name
 * against this hard-coded list and always rebuild the URL from here.
 *
 * A brand is added only when its official domain is unambiguous and stable.
 * When no brand is recognised, the caller attaches no safe link at all — an
 * invented "official" URL would be worse than showing nothing.
 */

/**
 * @typedef {object} OfficialSite
 * @property {string} id
 * @property {string} displayName brand name shown to the user
 * @property {RegExp} pattern matches the brand as written in a message
 * @property {string} officialUrl verified URL, rebuilt from this registry
 */

/** @type {OfficialSite[]} */
export const OFFICIAL_SITES = [
  // Carriers and delivery — the most impersonated brands in smishing.
  {
    id: "dhl",
    displayName: "DHL",
    pattern: /\bdhl\b/i,
    officialUrl: "https://www.dhl.com",
  },
  {
    id: "chronopost",
    displayName: "Chronopost",
    pattern: /\bchronopost\b/i,
    officialUrl: "https://www.chronopost.fr",
  },
  {
    id: "mondialrelay",
    displayName: "Mondial Relay",
    pattern: /\bmondial\s?relay\b/i,
    officialUrl: "https://www.mondialrelay.fr",
  },
  {
    id: "laposte",
    displayName: "La Poste",
    pattern: /\b(?:la\s?poste|laposte)\b/i,
    officialUrl: "https://www.laposte.fr",
  },
  {
    id: "dpd",
    displayName: "DPD",
    pattern: /\bdpd\b/i,
    officialUrl: "https://www.dpd.com",
  },
  {
    id: "ups",
    displayName: "UPS",
    pattern: /\bups\b/i,
    officialUrl: "https://www.ups.com",
  },
  {
    id: "fedex",
    displayName: "FedEx",
    pattern: /\bfed\s?ex\b/i,
    officialUrl: "https://www.fedex.com",
  },
  // Payment and commerce.
  {
    id: "paypal",
    displayName: "PayPal",
    pattern: /\bpaypal\b/i,
    officialUrl: "https://www.paypal.com",
  },
  {
    id: "amazon",
    displayName: "Amazon",
    pattern: /\bamazon\b/i,
    officialUrl: "https://www.amazon.com",
  },
  {
    id: "netflix",
    displayName: "Netflix",
    pattern: /\bnetflix\b/i,
    officialUrl: "https://www.netflix.com",
  },
  // Technology.
  {
    id: "microsoft",
    displayName: "Microsoft",
    pattern: /\bmicrosoft\b/i,
    officialUrl: "https://www.microsoft.com",
  },
  {
    id: "apple",
    displayName: "Apple",
    pattern: /\bapple\b/i,
    officialUrl: "https://www.apple.com",
  },
  {
    id: "google",
    displayName: "Google",
    pattern: /\bgoogle\b/i,
    officialUrl: "https://www.google.com",
  },
  {
    id: "whatsapp",
    displayName: "WhatsApp",
    pattern: /\bwhats\s?app\b/i,
    officialUrl: "https://www.whatsapp.com",
  },
  // Telecoms (France).
  {
    id: "orange",
    displayName: "Orange",
    pattern: /\borange\b/i,
    officialUrl: "https://www.orange.fr",
  },
  {
    id: "sfr",
    displayName: "SFR",
    pattern: /\bsfr\b/i,
    officialUrl: "https://www.sfr.fr",
  },
  {
    id: "bouygues",
    displayName: "Bouygues Telecom",
    pattern: /\bbouygues\b/i,
    officialUrl: "https://www.bouyguestelecom.fr",
  },
  {
    id: "free",
    displayName: "Free",
    pattern: /\bfree\s?(?:telecom|mobile)\b/i,
    officialUrl: "https://www.free.fr",
  },
  // Public services (France) — heavily impersonated in tax and health scams.
  {
    id: "impots",
    displayName: "Impôts (DGFiP)",
    pattern: /\b(?:impots|impôts|dgfip|direction generale des finances)\b/i,
    officialUrl: "https://www.impots.gouv.fr",
  },
  {
    id: "ameli",
    displayName: "Assurance Maladie (Ameli)",
    pattern: /\b(?:ameli|amélie|assurance\s?maladie|cpam)\b/i,
    officialUrl: "https://www.ameli.fr",
  },
];

/** Hostnames we accept as official, derived from the registry itself. */
const TRUSTED_HOSTNAMES = new Set(
  OFFICIAL_SITES.map((site) => new URL(site.officialUrl).hostname.replace(/^www\./, "")),
);

/**
 * Finds the official site entry for the first brand mentioned in a text.
 * @param {string} text
 * @returns {OfficialSite|null}
 */
export function findOfficialSite(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  for (const site of OFFICIAL_SITES) {
    if (site.pattern.test(text)) return site;
  }
  return null;
}

/**
 * Finds the official site entry for a brand name the model reported.
 * Used to map "DHL" back to the registry, never to trust a model URL.
 * @param {string} brandName
 * @returns {OfficialSite|null}
 */
export function findSiteByBrandName(brandName) {
  if (typeof brandName !== "string" || !brandName.trim()) return null;
  const needle = brandName.trim().toLowerCase();
  return (
    OFFICIAL_SITES.find(
      (site) =>
        site.id === needle ||
        site.displayName.toLowerCase() === needle ||
        site.pattern.test(brandName),
    ) || null
  );
}

/**
 * True when a URL points at a hostname in the registry. This is the guard that
 * keeps a hallucinated or injected URL out of the "verified" button.
 * @param {string} url
 * @returns {boolean}
 */
export function isTrustedOfficialUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return TRUSTED_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Builds the `official_safe_url` payload from a registry entry.
 * @param {OfficialSite} site
 * @returns {{ impersonated_brand: string, official_url: string }}
 */
export function buildOfficialSafeUrl(site) {
  return {
    impersonated_brand: site.displayName,
    official_url: site.officialUrl,
  };
}

/**
 * Resolves the safe link for a message.
 *
 * A brand must be recognised in the registry, and something must point at
 * impersonation: a link in the message, a brand the model explicitly named, or
 * a verdict of at least "Suspicious". A bare brand name is not enough on its
 * own — "your Amazon order has shipped" is not an impersonation and needs no
 * rescue link.
 *
 * @param {object} options
 * @param {string} options.text the analysed message
 * @param {string} [options.brandName] a brand the model proposed
 * @param {string} [options.riskLevel] the final verdict
 * @param {boolean} [options.hasLink] whether the message contains a link
 * @returns {{ impersonated_brand: string, official_url: string }|null}
 */
export function resolveOfficialSafeUrl({ text, brandName, riskLevel, hasLink }) {
  const site =
    findOfficialSite(text) || findSiteByBrandName(brandName) || null;
  if (!site) return null;

  const explicitBrand = Boolean(brandName && String(brandName).trim());
  const risky = riskLevel === "Suspicious" || riskLevel === "Very dangerous";
  if (!hasLink && !explicitBrand && !risky) return null;

  return buildOfficialSafeUrl(site);
}
