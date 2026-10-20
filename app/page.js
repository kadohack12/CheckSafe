"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Info,
  Lightbulb,
  Loader2,
  RotateCcw,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";

import { MAX_MESSAGE_LENGTH } from "@/lib/constants";
import { EXAMPLES, FALLBACK_RISK_STYLE, RISK_STYLES } from "@/lib/ui";

export default function Home() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const riskStyle = useMemo(
    () =>
      (result && RISK_STYLES[result.niveau_risque]) || FALLBACK_RISK_STYLE,
    [result],
  );

  const tooLong = message.length > MAX_MESSAGE_LENGTH;
  const canSubmit = message.trim().length > 0 && !tooLong && !loading;

  async function handleAnalyze(event) {
    event?.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "L'analyse n'a pas pu aboutir. Verifiez votre connexion et reessayez.",
        );
      }

      setResult(data);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Impossible de contacter le service d'analyse pour le moment.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleExample(example) {
    setMessage(example.text);
    setResult(null);
    setError("");
  }

  function handleReset() {
    setMessage("");
    setResult(null);
    setError("");
    setCopied(false);
  }

  async function handleCopy() {
    if (!result) return;
    const summary = [
      `Niveau de risque : ${result.niveau_risque}`,
      result.resume_simple,
      result.pieges_detectes?.length
        ? `Pieges detectes : ${result.pieges_detectes.join(", ")}`
        : null,
      `Actions conseillees : ${(result.actions_conseillees || []).join(" | ")}`,
      result.phrase_rassurante,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("La copie automatique n'est pas disponible sur cet appareil.");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            CheckSafe
          </h1>
        </div>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Un doute sur un message ? Vérifions ensemble en toute tranquillité.
        </p>
      </header>

      <form
        onSubmit={handleAnalyze}
        className="rounded-3xl bg-white/90 p-5 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 backdrop-blur sm:p-7"
      >
        <label
          htmlFor="message"
          className="mb-2 block text-sm font-semibold text-slate-700"
        >
          Collez ici le message qui vous inquiète (SMS, e-mail, WhatsApp…)
        </label>
        <textarea
          id="message"
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              handleAnalyze(event);
            }
          }}
          rows={7}
          spellCheck="false"
          aria-describedby="message-help"
          placeholder="Exemple : « Votre colis est bloqué, cliquez ici pour payer 2,99 € »"
          className="w-full resize-y rounded-2xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-base leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15"
        />

        <div
          id="message-help"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
        >
          <span>
            Astuce : vous pouvez aussi appuyer sur{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-600">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-600">
              Entrée
            </kbd>
          </span>
          <span className={tooLong ? "font-semibold text-rose-600" : ""}>
            {message.length} / {MAX_MESSAGE_LENGTH}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Analyse en cours…
              </>
            ) : (
              <>
                <Search className="h-5 w-5" aria-hidden="true" />
                Analyser
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={loading || (!message && !result && !error)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3.5 text-base font-medium text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Effacer
          </button>
        </div>
      </form>

      <section aria-labelledby="exemples-titre">
        <h2
          id="exemples-titre"
          className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Exemples rapides à tester
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => handleExample(example)}
              disabled={loading}
              className="group flex flex-col items-start gap-1 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-xl" aria-hidden="true">
                {example.emoji}
              </span>
              <span className="text-sm font-semibold text-slate-700 group-hover:text-blue-700">
                {example.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200"
        >
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>{error}</p>
        </div>
      )}

      {loading && !result && (
        <div
          aria-live="polite"
          className="flex items-center gap-3 rounded-2xl bg-white/80 p-4 text-sm text-slate-600 ring-1 ring-slate-200"
        >
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" aria-hidden="true" />
          Nous lisons le message attentivement, quelques secondes…
        </div>
      )}

      {result && (
        <section
          aria-live="polite"
          className="animate-fade-in-up space-y-5"
        >
          <div className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-200">
            <div className={`h-1.5 w-full ${riskStyle.bar}`} aria-hidden="true" />
            <div className="space-y-5 p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 ${riskStyle.badge}`}
                >
                  <riskStyle.icon className="h-4 w-4" aria-hidden="true" />
                  {riskStyle.label}
                </span>
                <span className="text-xs text-slate-400">
                  {result.niveau_risque}
                </span>
              </div>

              <p className="text-lg leading-relaxed text-slate-800">
                {result.resume_simple}
              </p>

              {result.meta?.degraded && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Nos services d&apos;analyse étaient momentanément indisponibles.
                  Ce résultat est un message de prudence, pas une analyse.
                </p>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div className={`rounded-2xl p-4 ring-1 ${riskStyle.panel}`}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                    Pièges détectés
                  </h3>
                  {result.pieges_detectes?.length ? (
                    <ul className="space-y-2">
                      {result.pieges_detectes.map((piege, index) => (
                        <li
                          key={`${piege}-${index}`}
                          className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-700 ring-1 ring-white"
                        >
                          {piege}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed text-slate-600">
                      Aucun piège évident repéré dans ce message.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-200">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Actions recommandées
                  </h3>
                  <ol className="space-y-2">
                    {(result.actions_conseillees || []).map((action, index) => (
                      <li
                        key={`${action}-${index}`}
                        className="flex items-start gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-700 ring-1 ring-white"
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                          {index + 1}
                        </span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-start gap-3 text-sm leading-relaxed text-emerald-900">
                  <Lightbulb
                    className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                  {result.phrase_rassurante}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/30"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {copied ? "Copié !" : "Copier le résumé"}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="mt-auto space-y-3 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Note de transparence : CheckSafe analyse les schémas d&apos;ingénierie
            sociale et la manipulation psychologique. Il ne remplace pas une
            analyse réseau approfondie ni une vérification directe auprès des
            organismes officiels.
          </span>
        </p>
        <p className="text-slate-400">
          Projet réalisé pour le hackathon SafeSpace. N&apos;envoyez jamais de mot
          de passe, de code de validation ni de coordonnées bancaires.
        </p>
      </footer>
    </main>
  );
}
