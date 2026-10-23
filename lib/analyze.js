import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

import {
  RISK_LEVELS,
  SYSTEM_PROMPT,
  buildUserPrompt,
} from "./prompt.js";
import { analyzeLocally, escalateRiskLevel } from "./localRules.js";
import { RESPONSE_FIELDS } from "./constants.js";
import { defangText, hasLinks } from "./defang.js";
import { resolveOfficialSafeUrl } from "./officialSites.js";

/**
 * Provider orchestration.
 *
 * Two providers are queried CONCURRENTLY and the first usable answer wins.
 * A sequential chain was measured at 30 s when the first provider was
 * overloaded, which is far too slow for a frightened user; the race brings
 * the typical latency down to 2-3 s.
 *
 * Determinism: temperature is 0 on every provider. The same message must
 * produce the same verdict on stage as it did in testing.
 */

const GEMINI_BUDGET_MS = 14_000;
const GROQ_BUDGET_MS = 25_000;

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
].filter(Boolean);

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/** Logs the model actually tried and the reason it failed, per attempt. */
function logAttempt(provider, model, outcome) {
  console.log(`[CheckSafe] ${provider}/${model} -> ${outcome}`);
}

function describeError(error) {
  const status = error?.status || error?.response?.status;
  const message = error?.message || String(error);
  if (status) return `${status} ${message}`.slice(0, 160);
  if (/timeout|aborted/i.test(message)) return `timeout ${message}`.slice(0, 160);
  return message.slice(0, 160);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Pulls the first JSON object out of a model reply, fences included. */
export function extractJson(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Keeps a quote only when it really is a substring of the message. */
function validQuote(quote, message) {
  if (typeof quote !== "string") return null;
  const trimmed = quote.trim();
  if (trimmed.length < 3) return null;
  return message.includes(trimmed) ? trimmed : null;
}

const STOP_WORDS = new Set([
  "the", "a", "an", "of", "and", "or", "with", "from", "to", "in", "on",
  "de", "du", "des", "la", "le", "les", "un", "une", "et", "ou", "avec",
  "par", "pour", "sur", "au", "aux", "d", "l",
]);

function keywords(label) {
  return new Set(
    String(label)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word)),
  );
}

/**
 * True when two trap labels describe the same thing in different words.
 * The model and the rules engine label the same technique independently, so
 * exact string comparison would show the same trap twice.
 */
function sharesKeywords(left, right) {
  const a = keywords(left);
  const b = keywords(right);
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared >= 1;
}

/**
 * Forces a model reply into the response contract, discarding anything that
 * does not fit. A malformed answer must never reach the user.
 *
 * @returns {object|null} null when the reply is unusable
 */
export function normalizeResult(parsed, message) {
  if (!parsed || typeof parsed !== "object") return null;

  const risk_level = RISK_LEVELS.includes(parsed.risk_level)
    ? parsed.risk_level
    : null;
  if (!risk_level) return null;

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : null;
  if (!summary) return null;

  // Accept both the object form and a plain string, and keep only quotes that
  // genuinely appear in the message: a paraphrase would break highlighting.
  const traps = Array.isArray(parsed.detected_traps) ? parsed.detected_traps : [];
  const detected_traps = [];
  const trap_quotes = [];
  for (const trap of traps.slice(0, 5)) {
    const label = typeof trap === "string" ? trap : trap?.label;
    if (typeof label !== "string" || !label.trim()) continue;
    detected_traps.push(label.trim());
    if (trap && typeof trap === "object") {
      const quote = validQuote(trap.quote, message);
      if (quote) trap_quotes.push(quote);
    }
  }

  const actions = Array.isArray(parsed.recommended_actions)
    ? parsed.recommended_actions
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
        .slice(0, 4)
    : [];
  if (actions.length === 0) return null;

  const reassurance =
    typeof parsed.reassurance === "string" && parsed.reassurance.trim()
      ? parsed.reassurance.trim()
      : null;
  if (!reassurance) return null;

  // The model may propose a brand, but its URL is never trusted: the safe link
  // is rebuilt from our own registry, or omitted entirely.
  const official_safe_url = resolveOfficialSafeUrl({
    text: message,
    brandName: parsed.official_safe_url?.impersonated_brand,
    riskLevel: risk_level,
    hasLink: hasLinks(message),
  });

  return {
    risk_level,
    summary,
    detected_traps,
    trap_quotes,
    recommended_actions: actions,
    reassurance,
    official_safe_url,
  };
}

async function callGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const client = new GoogleGenerativeAI(apiKey);
  const prompt = buildUserPrompt(message);

  return withTimeout(
    (async () => {
      let lastError;
      for (const modelId of GEMINI_MODELS) {
        try {
          const model = client.getGenerativeModel({
            model: modelId,
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: { temperature: 0, maxOutputTokens: 1024 },
          });
          const response = await model.generateContent(prompt);
          const text = response?.response?.text?.();
          const parsed = extractJson(text);
          const result = normalizeResult(parsed, message);
          if (!result) throw new Error("unusable reply");
          logAttempt("gemini", modelId, "ok");
          return result;
        } catch (error) {
          lastError = error;
          logAttempt("gemini", modelId, describeError(error));
        }
      }
      throw lastError || new Error("no Gemini model answered");
    })(),
    GEMINI_BUDGET_MS,
    "gemini",
  );
}

async function callGroq(message) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const client = new Groq({ apiKey });

  return withTimeout(
    (async () => {
      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(message) },
        ],
      });
      const text = completion?.choices?.[0]?.message?.content;
      const parsed = extractJson(text);
      const result = normalizeResult(parsed, message);
      if (!result) throw new Error("unusable reply");
      logAttempt("groq", GROQ_MODEL, "ok");
      return result;
    })(),
    GROQ_BUDGET_MS,
    "groq",
  );
}

const PROVIDERS = [
  { name: "gemini", call: callGemini },
  { name: "groq", call: callGroq },
];

/**
 * Builds the public API payload from an engine result.
 *
 * Only the fields named in `RESPONSE_FIELDS` are copied. Spreading the engine
 * result instead would forward whatever it happens to return, including the
 * rules engine's internal `matched_rules`, which belongs under
 * `meta.local_rules` and must not appear as a top-level field.
 *
 * `trap_quotes` is filtered against the redacted text: a quote that does not
 * literally appear in the message would break highlighting.
 *
 * @param {object} result engine result (model or rules engine)
 * @param {string} redactedText the text that was actually analysed
 */
export function buildPublicResult(result, redactedText) {
  const payload = {};
  for (const field of RESPONSE_FIELDS) {
    if (field === "defanged_text") {
      payload.defanged_text = defangText(redactedText);
    } else if (field === "trap_quotes") {
      payload.trap_quotes = (result.trap_quotes || []).filter(
        (quote) => typeof quote === "string" && redactedText.includes(quote),
      );
    } else if (field in result) {
      payload[field] = result[field];
    }
  }
  return payload;
}

/**
 * Analyses a message.
 *
 * @returns {Promise<{ result: object, provider: string|null, attempts: string[], local: object }>}
 *   `provider` is null when every AI provider failed, in which case `result`
 *   comes from the local rules engine.
 */
export async function analyzeMessage(message) {
  const attempts = [];
  const local = analyzeLocally(message);

  // First usable answer wins, so an overloaded provider cannot slow the reply
  // down to its own budget. Promise.any rejects only once every provider has
  // failed, which is exactly when we fall back to the local rules.
  let winner = null;
  const racers = PROVIDERS.map(async (provider) => {
    try {
      const result = await provider.call(message);
      return { provider: provider.name, result };
    } catch (error) {
      const reason = describeError(error);
      attempts.push(`${provider.name}: ${reason}`);
      throw error;
    }
  });

  try {
    winner = await Promise.any(racers);
  } catch {
    winner = null;
  }

  if (!winner) {
    // Every provider is down. Answer from the rules engine rather than
    // shrugging: an obvious scam must still be flagged.
    console.log(
      `[CheckSafe] all providers failed, using local rules (${local.matched_rules.join(",") || "no match"})`,
    );
    return { result: local, provider: null, attempts, local };
  }

  // Safety floor: local rules may only raise the verdict, never lower it.
  const escalation = escalateRiskLevel(
    winner.result.risk_level,
    local.risk_level,
  );

  let result = winner.result;
  if (escalation.escalated) {
    console.log(
      `[CheckSafe] local rules escalated ${winner.result.risk_level} -> ${escalation.risk_level}`,
    );
    const mergedTraps = [...result.detected_traps];
    const mergedQuotes = [...(result.trap_quotes || [])];
    for (let index = 0; index < local.detected_traps.length; index += 1) {
      const label = local.detected_traps[index];
      // Skip labels the model already reported in another wording, to avoid
      // showing "Lien raccourci" twice under two different names.
      const alreadyCovered = mergedTraps.some((existing) =>
        sharesKeywords(existing, label),
      );
      if (!alreadyCovered) mergedTraps.push(label);
      const quote = local.trap_quotes[index];
      if (quote && !mergedQuotes.includes(quote)) mergedQuotes.push(quote);
    }
    result = {
      ...result,
      risk_level: escalation.risk_level,
      detected_traps: mergedTraps,
      trap_quotes: mergedQuotes,
    };
  }

  // Re-resolve the safe link against the FINAL verdict: a local rule may have
  // escalated the level after the model proposed (or omitted) a brand.
  result = {
    ...result,
    official_safe_url: resolveOfficialSafeUrl({
      text: message,
      brandName: result.official_safe_url?.impersonated_brand,
      riskLevel: result.risk_level,
      hasLink: hasLinks(message),
    }),
  };

  return { result, provider: winner.provider, attempts, local };
}
