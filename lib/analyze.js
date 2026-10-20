import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";

import { RISK_LEVELS, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";

/**
 * Les identifiants de modeles sont volatils : Google et Groq retirent
 * regulierement les anciens. Chaque fournisseur recoit donc une liste
 * ordonnee et bascule sur le suivant si un modele a disparu.
 */
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS ||
  process.env.GEMINI_MODEL ||
  "gemini-flash-latest,gemini-2.5-flash"
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

const PROVIDER_TIMEOUT_MS = Number(process.env.PROVIDER_TIMEOUT_MS || 15000);

/**
 * Budget total de l'analyse, a garder sous `maxDuration` de la route
 * (app/api/analyze/route.js). Sans ce plafond, une chaine de repli longue
 * (2 modeles Gemini x 2 modeles Groq) pourrait depasser la limite de la
 * fonction et produire un 504 au lieu du mode degrade.
 */
const TOTAL_BUDGET_MS = Number(process.env.TOTAL_BUDGET_MS || 50000);

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

/** Delai restant avant l'echeance, plafonne a PROVIDER_TIMEOUT_MS. */
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

async function analyzeWithGemini(message, deadline) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY absente");

  const client = new GoogleGenerativeAI(apiKey);
  let lastError;

  for (const modelName of GEMINI_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) break;
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
      lastError = error;
    }
  }

  throw lastError ?? new Error("Aucun modele Gemini disponible");
}

async function analyzeWithGroq(message, deadline) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY absente");

  const client = new Groq({
    apiKey,
    maxRetries: 1,
    timeout: PROVIDER_TIMEOUT_MS,
  });

  let lastError;

  for (const model of GROQ_MODELS) {
    const budget = attemptBudget(deadline);
    if (budget < 1000) break;
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
      lastError = error;
    }
  }

  throw lastError ?? new Error("Aucun modele Groq disponible");
}

const PROVIDERS = [
  { name: "gemini", run: analyzeWithGemini },
  { name: "groq", run: analyzeWithGroq },
];

/**
 * Essaie chaque fournisseur dans l'ordre et s'arrete au premier resultat
 * exploitable. Une panne, un quota epuise ou un modele retire chez Gemini
 * bascule sur Groq. L'ensemble reste borne par TOTAL_BUDGET_MS.
 */
export async function analyzeMessage(message) {
  const attempts = [];
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (const provider of PROVIDERS) {
    if (deadline - Date.now() < 1000) {
      attempts.push(`${provider.name}: budget de temps epuise`);
      continue;
    }
    try {
      const raw = await provider.run(message, deadline);
      const result = normalizeResult(extractJsonObject(raw));
      if (!result) throw new Error("reponse du modele illisible (JSON invalide)");

      if (attempts.length > 0) {
        console.warn(
          `[CheckSafe] repli sur ${provider.name} apres : ${attempts.join(" | ")}`,
        );
      }
      return { result, provider: provider.name, attempts };
    } catch (error) {
      const reason = error?.message || String(error);
      attempts.push(`${provider.name}: ${reason}`);
      console.error(`[CheckSafe] echec ${provider.name} -`, reason);
    }
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
