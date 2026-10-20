"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Eye,
  Info,
  Lightbulb,
  Loader2,
  Lock,
  MessageCircle,
  RotateCcw,
  Search,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  XCircle,
} from "lucide-react";

import { MAX_MESSAGE_LENGTH } from "@/lib/constants";
import { redactSensitiveData } from "@/lib/redact";
import { buildShareText, buildSmsLink, buildWhatsAppLink } from "@/lib/share";
import { EXAMPLES, FALLBACK_RISK_STYLE, RISK_STYLES } from "@/lib/ui";

export default function Home() {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Redaction runs live so the badge can tell the user what is being removed
  // before they press Analyse. Nothing is sent until they do.
  const redaction = useMemo(() => redactSensitiveData(message), [message]);

  const riskStyle = useMemo(
    () => (result && RISK_STYLES[result.risk_level]) || FALLBACK_RISK_STYLE,
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
      // The redacted text is what actually leaves the browser. The raw message
      // never reaches the API.
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: redaction.text }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data?.error ||
            "The analysis could not complete. Check your connection and try again.",
        );
      }

      setResult(data);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "We cannot reach the analysis service right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleExample(example) {
    setMessage(example.text);
    setResult(null);
    setError("");
    setShowPreview(false);
  }

  function handleReset() {
    setMessage("");
    setResult(null);
    setError("");
    setCopied(false);
    setShowPreview(false);
  }

  async function handleCopy() {
    if (!result) return;
    const summary = [
      `Risk level: ${result.risk_level}`,
      result.summary,
      result.detected_traps?.length
        ? `Traps detected: ${result.detected_traps.join(", ")}`
        : null,
      `Recommended actions: ${(result.recommended_actions || []).join(" | ")}`,
      result.reassurance,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Automatic copy is not available on this device.");
    }
  }

  const shareText = result ? buildShareText(result) : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
            <ShieldCheck className="h-7 w-7" aria-hidden="true" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            CheckSafe
          </h1>
        </div>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
          Not sure about a message? Let&apos;s look at it together, calmly.
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
          Paste the message that worries you (SMS, email, WhatsApp…)
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
          placeholder="Example: “Your parcel is blocked, click here to pay 2.99 EUR”"
          className="w-full resize-y rounded-2xl border border-slate-300 bg-slate-50/60 px-4 py-3 text-base leading-relaxed text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/15"
        />

        <div
          id="message-help"
          className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
        >
          <span>
            Tip: you can also press{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-600">
              Ctrl
            </kbd>{" "}
            +{" "}
            <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-sans text-[11px] text-slate-600">
              Enter
            </kbd>
          </span>
          <span className={tooLong ? "font-semibold text-rose-600" : ""}>
            {message.length} / {MAX_MESSAGE_LENGTH}
          </span>
        </div>

        {/* Privacy badge. Only claims what the code actually does: personal
            identifiers are masked locally, before anything is sent. */}
        {redaction.total > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 ring-1 ring-emerald-200">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="font-semibold">
              Private data masked before analysis
            </span>
            <span className="text-emerald-700">
              — {redaction.labels.join(", ")} ({redaction.total})
            </span>
            <button
              type="button"
              onClick={() => setShowPreview((value) => !value)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {showPreview ? "Hide" : "See exactly what is sent"}
            </button>
          </div>
        )}

        {showPreview && redaction.total > 0 && (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-xs leading-relaxed text-slate-100">
            {redaction.text}
          </pre>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Analysing…
              </>
            ) : (
              <>
                <Search className="h-5 w-5" aria-hidden="true" />
                Analyse
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
            Clear
          </button>
        </div>
      </form>

      <section aria-labelledby="examples-title">
        <h2
          id="examples-title"
          className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500"
        >
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Quick examples to try
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
          <Loader2
            className="h-5 w-5 animate-spin text-blue-600"
            aria-hidden="true"
          />
          We are reading the message carefully, a few seconds…
        </div>
      )}

      {result && (
        <section aria-live="polite" className="animate-fade-in-up space-y-5">
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
                  {result.risk_level}
                </span>
              </div>

              <p className="text-lg leading-relaxed text-slate-800">
                {result.summary}
              </p>

              {result.meta?.degraded && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Our analysis services were temporarily unavailable. This is a
                  safety message, not an analysis.
                </p>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <div className={`rounded-2xl p-4 ring-1 ${riskStyle.panel}`}>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <ClipboardList className="h-4 w-4" aria-hidden="true" />
                    Traps detected
                  </h3>
                  {result.detected_traps?.length ? (
                    <ul className="space-y-2">
                      {result.detected_traps.map((trap, index) => (
                        <li
                          key={`${trap}-${index}`}
                          className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-relaxed text-slate-700 ring-1 ring-white"
                        >
                          {trap}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm leading-relaxed text-slate-600">
                      No obvious trap found in this message.
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-blue-50/70 p-4 ring-1 ring-blue-200">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Recommended actions
                  </h3>
                  <ol className="space-y-2">
                    {(result.recommended_actions || []).map((action, index) => (
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
                  {result.reassurance}
                </p>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/30"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {copied ? "Copied!" : "Copy summary"}
                </button>
              </div>
            </div>
          </div>

          {/* Share with a relative. Scams spread through families, so warning
              someone is the highest-value action a user can take. */}
          <div className="rounded-3xl bg-white p-5 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 sm:p-7">
            <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Share2 className="h-5 w-5 text-blue-600" aria-hidden="true" />
              Share with someone you care about
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-slate-600">
              A short warning is the best protection. Send this verdict to a
              parent, a neighbour or a friend who might receive the same
              message.
            </p>

            <pre className="mb-4 max-h-44 overflow-auto whitespace-pre-wrap rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 ring-1 ring-slate-200">
              {shareText}
            </pre>

            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={buildWhatsAppLink(shareText)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Send on WhatsApp
              </a>
              <a
                href={buildSmsLink(shareText)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300/40"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Send by SMS
              </a>
            </div>
          </div>
        </section>
      )}

      <footer className="mt-auto space-y-3 border-t border-slate-200 pt-6 text-xs leading-relaxed text-slate-500">
        <p className="flex items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Phone numbers, email addresses, bank details and card numbers are
            masked in your browser before the message is sent. We do not store
            it, and we never ask for a password, a code or bank details.
          </span>
        </p>
        <p className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Transparency note: CheckSafe reads the wording of a message for
            social-engineering patterns. It does not scan links, attachments or
            your device, and it does not replace checking with the organisation
            itself. Treat the result as a second opinion, never a guarantee.
          </span>
        </p>
        <p className="text-slate-400">
          Built for the SafeSpace hackathon. Never send a password, a
          verification code or bank details to anyone.
        </p>
      </footer>
    </main>
  );
}
