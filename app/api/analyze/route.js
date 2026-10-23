import { NextResponse } from "next/server";

import { analyzeMessage, buildPublicResult } from "@/lib/analyze";
import { MAX_MESSAGE_LENGTH } from "@/lib/constants";
import { redactSensitiveData } from "@/lib/redact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case is bounded by the per-provider budgets plus overhead.

const MAX_DIAGNOSTIC_LENGTH = 160;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "The request body must be valid JSON." },
      { status: 400 },
    );
  }

  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Please paste the message you want to check." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `The message is too long (${message.length} characters). The limit is ${MAX_MESSAGE_LENGTH}.`,
      },
      { status: 413 },
    );
  }

  const startedAt = Date.now();

  // Redaction runs again here. The browser already masks the message, but the
  // API is public and can be called directly, so the server is the real
  // enforcement point rather than a second opinion.
  const redaction = redactSensitiveData(message);

  try {
    const { result, provider, attempts, local } = await analyzeMessage(
      redaction.text,
    );

    // Deliberately log metadata only, never the message itself: the content
    // may contain personal or financial details.
    console.log(
      `[CheckSafe] analysed ${message.length} chars in ${Date.now() - startedAt} ms (provider=${provider ?? "local-rules"}, masked=${redaction.total})`,
    );

    const publicResult = buildPublicResult(result, redaction.text);

    return NextResponse.json({
      ...publicResult,
      meta: {
        provider,
        // "degraded" means the answer came from the rules engine, not a model.
        degraded: provider === null,
        local_rules: local?.matched_rules || [],
        provider_errors: attempts.map((entry) =>
          entry.slice(0, MAX_DIAGNOSTIC_LENGTH),
        ),
        duration_ms: Date.now() - startedAt,
        masked: redaction.total,
      },
    });
  } catch (error) {
    console.error("[CheckSafe] unexpected error:", error?.message || error);
    return NextResponse.json(
      { error: "Something unexpected happened during the analysis." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Use POST to analyse a message." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
