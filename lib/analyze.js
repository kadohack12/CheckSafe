import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

import { RISK_LEVELS, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

/**
 * Les identifiants de modeles sont volatils : Google et Groq retirent
 * regulierement les anciens. Chaque fournisseur recoit donc une liste
 * ordonnee et bascule sur le suivant si un modele a disparu.
 *
 * Google refuse certains modeles aux cles API recentes ("no longer available
 * to new users") meme quand la documentation les liste encore : d'ou
 * plusieurs entrees par fournisseur.
 */
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  "gemini-3.8-flash,gemini-flash-latest,gemini-2.5-flash"
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

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 8000);

/**
 * Budgets par fournisseur, a garder sous `maxDuration` de la route
 * (app/api/analyze/route.js). Sans plafond par fournisseur, un Gemini lent
 * consommerait tout le budget en essayant ses trois modeles et l'utilisateur
 * attendrait 30 s avant que Groq ne reponde.
 */
const GEMINI_BUDGET_MS = Number(process.env.GEMINI_BUDGET_MS || 14000);
const GROQ_BUDGET_MS = Number(process.env.GROQ_BUDGET_MS || 25000);

const TOTAL_BUDGET_MS = Number(process.env.TOTAL_BUDGET_MS || 45000);

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} : delai depasse (${ms} ms)`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Delai restant pour un modele, borne par sa tentative et son fournisseur. */
function attemptBudget(deadline) {
  return Math.min(PROVIDER_TIMEOUT_MS, deadline - Date.now());
}

/** Les modeles ajoutent parfois des fences Markdown malgre la consigne JSON. */
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

/** Ramene la reponse du modele a la forme attendue par l'interface. */
function normalizeResult(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const risk = RISK_LEVELS.includes(parsed.niveau_risque)
    ? parsed.niveau_risque
    : "Indéterminé";

  const resume =
    typeof parsed.resume_simple === "string" && parsed.resume_simple.trim()
      ? parsed.resume_simple.trim()
      : "Nous n'avons pas pu analyser ce message de facon fiable.";

  const actions = toTextList(parsed.actions_conseillees, 5);
  const pitfalls = toTextList(parsed.pieges_detectes, 5);

  return {
    niveau_risque: risk,
    resume_simple: resume,
    pieges_detectes: pitfalls,
    actions_conseillees:
      actions.length > 0
        ? actions
        : [
            "Ne cliquez sur aucun lien de ce message.",
            "Verifiez l'information par un autre canal (numero officiel, application de l'organisme).",
          ],
    phrase_rassurante:
      typeof parsed.phrase_rassurante === "string" &&
      parsed.phrase_rassurante.trim()
        ? parsed.phrase_rassurante.trim()
        : "Vous avez eu le bon reflexe en verifiant avant d'agir : c'est exactement ce qu'il faut faire.",
  };
}

async function analyzeWithGemini(message, deadline, attempts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY absente");

  const client = new GoogleGenerativeAI(apiKey);
  let succeeded = false;

  for (const modelName of GEMINI_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) {
      attempts.push(`gemini ${modelName} : budget de temps epuise`);
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
      succeeded = true;
      return response.response.text();
    } catch (error) {
      attempts.push(`gemini ${modelName} : ${error?.message || String(error)}`);
    }
  }

  if (!succeeded) throw new Error("Aucun modele Gemini n'a repondu");
}

async function analyzeWithGroq(message, deadline, attempts) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY absente");

  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: PROVIDER_TIMEOUT_MS,
  });

  let succeeded = false;

  for (const model of GROQ_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) {
      attempts.push(`groq ${model} : budget de temps epuise`);
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
      succeeded = true;
      return completion.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      attempts.push(`groq ${model} : ${error?.message || String(error)}`);
    }
  }

  if (!succeeded) throw new Error("Aucun modele Groq n'a repondu");
}

const PROVIDERS = [
  { name: "gemini", run: analyzeWithGemini, budgetMs: GEMINI_BUDGET_MS },
  { name: "groq", run: analyzeWithGroq, budgetMs: GROQ_BUDGET_MS },
];

/**
 * Interroge les fournisseurs en parallele et retient le premier resultat
 * exploitable. Un repli sequentiel ferait attendre l'utilisateur pendant
 * tout le budget de Gemini (lent ou sature) avant que Groq, qui repond en
 * quelques secondes, ne soit seulement interroge.
 *
 * Chaque fournisseur garde son propre plafond, et TOTAL_BUDGET_MS borne
 * l'ensemble pour rester sous `maxDuration` de la route.
 */
export async function analyzeMessage(message) {
  const attempts = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  const runners = PROVIDERS.map(async (provider) => {
    const providerDeadline = Math.min(deadline, Date.now() + provider.budgetMs);
    const raw = await provider.run(message, providerDeadline, attempts);
    const result = normalizeResult(extractJsonObject(raw));
    if (!result) {
      throw new Error(`${provider.name} : reponse illisible (JSON invalide)`);
    }
    return { result, provider: provider.name };
  });

  try {
    const winner = await Promise.any(runners);
    if (attempts.length > 0) {
      console.warn(
        `[CheckSafe] repondu par ${winner.provider} ; echecs : ${attempts.join(" | ")}`,
      );
    }
    return { ...winner, attempts };
  } catch {
    // Tous les fournisseurs ont echoue : mode degrade, jamais de faux verdict.
    console.error(`[CheckSafe] tous les fournisseurs ont echoue : ${attempts.join(" | ")}`);
  }

  return {
    result: normalizeResult({
      niveau_risque: "Indéterminé",
      resume_simple:
        "Nos deux services d'analyse sont momentanement indisponibles, nous ne pouvons donc pas evaluer ce message.",
      pieges_detectes: [],
      actions_conseillees: [
        "Ne cliquez sur aucun lien et n'envoyez aucun code ni mot de passe.",
        "Reessayez dans quelques minutes.",
        "En cas de doute, contactez directement l'organisme concerne via son numero officiel.",
      ],
      phrase_rassurante:
        "Pas d'inquietude : en cas de doute, ne rien faire est toujours la bonne decision. Vous pouvez reessayer un peu plus tard.",
    }),
    provider: null,
    attempts,
  };
}
