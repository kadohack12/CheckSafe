import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

import { RISK_LEVELS, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

/**
 * Model identifiers are volatile: providers retire them regularly and Google
 * refuses some models to recently created API keys ("no longer available to
 * new users") even while still listing them in the docs. Each provider
 * therefore gets an ordered list and falls through to the next entry when a
 * model is gone or overloaded.
 */
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash,gemini-flash-latest"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const GROQ_MODELS = (
  process.env.GROQ_MODELS || "openai/gpt-oss-120b,openai/gpt-oss-20b"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

/** Per-attempt ceiling. Keeps one slow model from eating a whole budget. */
const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 8000);

/**
 * Per-provider budgets and a global ceiling, all kept under the route's
 * `maxDuration` so a slow provider degrades gracefully instead of producing
 * a platform 504.
 */
const GEMINI_BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS || 14000);
const GROQ_BUDGET_MS = Number(process.env.GROQ_BUDGET_MS || 25000);
const TOTAL_BUDGET_MS = Number(process.env.TOTAL_BUDGET_MS || 45000);

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms} ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Remaining time for one model attempt, capped by the per-attempt ceiling. */
function attemptBudget(deadline) {
  return Math.min(PROVIDER_TIMEOUT_MS, deadline - Date.now());
}

/** Models sometimes wrap JSON in Markdown fences despite the instruction. */
function extractJsonObject(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function toTextList(value, max) {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return items
    .filter((item) => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

/**
 * Maps a raw model answer onto the response contract. Unknown risk levels are
 * coerced to "Undetermined" rather than passed through, so the UI can never
 * render an unrecognised verdict as if it were valid.
 */
function normalizeResult(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const risk = RISK_LEVELS.includes(parsed.risk_level)
    ? parsed.risk_level
    : "Undetermined";

  const summary =
    typeof parsed.summary === "string" && parsed.summary.trim()
      ? parsed.summary.trim()
      : "We could not assess this message reliably.";

  const actions = toTextList(parsed.recommended_actions, 5);
  const traps = toTextList(parsed.detected_traps, 5);

  return {
    risk_level: risk,
    summary,
    detected_traps: traps,
    recommended_actions:
      actions.length > 0
        ? actions
        : [
            "Do not click any link in this message.",
            "Check the information through another channel (official number, official app).",
          ],
    reassurance:
      typeof parsed.reassurance === "string" && parsed.reassurance.trim()
        ? parsed.reassurance.trim()
        : "You did the right thing by checking before acting. That is exactly the right reflex.",
  };
}

async function analyzeWithGemini(message, deadline, attempts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const client = new GoogleGenerativeAI(apiKey);

  for (const modelName of GEMINI_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) {
      attempts.push(`gemini ${modelName}: no time budget left`);
      continue;
    }
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      });
      const response = await withTimeout(
        model.generateContent(buildUserPrompt(message)),
        budget,
        `Gemini (${modelName})`,
      );
      return response.response.text();
    } catch (error) {
      attempts.push(`gemini ${modelName}: ${error?.message || String(error)}`);
    }
  }

  throw new Error("no Gemini model answered");
}

async function analyzeWithGroq(message, deadline, attempts) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is missing");

  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: PROVIDER_TIMEOUT_MS,
  });

  for (const model of GROQ_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) {
      attempts.push(`groq ${model}: no time budget left`);
      continue;
    }
    try {
      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          temperature: 0.2,
          max_tokens: 2048,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(message) },
          ],
        }),
        budget,
        `Groq (${model})`,
      );
      return completion.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      attempts.push(`groq ${model}: ${error?.message || String(error)}`);
    }
  }

  throw new Error("no Groq model answered");
}

const PROVIDERS = [
  { name: "gemini", run: analyzeWithGemini, budgetMs: GEMINI_BUDGET_MS },
  { name: "groq", run: analyzeWithGroq, budgetMs: GROQ_BUDGET_MS },
];

/**
 * Queries every provider concurrently and keeps the first usable answer.
 * A sequential fallback would make the user wait out the full budget of a
 * slow or overloaded provider before the healthy one was even asked.
 *
 * If every provider fails, this returns an explicit degraded result instead of
 * throwing: the product must never invent a verdict, but it must still answer.
 */
export async function analyzeMessage(message) {
  const attempts = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const runners = PROVIDERS.map(async (provider) => {
    const providerDeadline = Math.min(deadline, Date.now() + provider.budgetMs);
    const raw = await provider.run(message, providerDeadline, attempts);
    const result = normalizeResult(extractJsonObject(raw));
    if (!result) {
      throw new Error(`${provider.name}: unreadable answer (invalid JSON)`);
    }
    return { result, provider: provider.name };
  });

  try {
    const winner = await Promise.any(runners);
    if (attempts.length > 0) {
      console.warn(
        `[CheckSafe] answered by ${winner.provider}; failures: ${attempts.join(" | ")}`,
      );
    }
    return { ...winner, attempts };
  } catch {
    console.error(
      `[CheckSafe] every provider failed: ${attempts.join(" | ")}`,
    );
  }

  return {
    result: normalizeResult({
      risk_level: "Undetermined",
      summary:
        "Our analysis services are temporarily unavailable, so we cannot assess this message.",
      detected_traps: [],
      recommended_actions: [
        "Do not click any link and do not share any code or password.",
        "Try again in a few minutes.",
        "If in doubt, contact the organisation directly using its official number.",
      ],
      reassurance:
        "No worries: when in doubt, doing nothing is always the safe choice. You can try again later.",
    }),
    provider: null,
    attempts,
  };
}
