import { NextResponse } from "next/server";

import { analyzeMessage } from "@/lib/analyze";
import { MAX_MESSAGE_LENGTH } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Worst case is bounded by TOTAL_BUDGET_MS (45 s) plus provider overhead.
// The margin below this ceiling lets the route return a degraded answer
// instead of a platform-level 504.
export const maxDuration = 60;

/**
 * Diagnostic strings are truncated before leaving the server: provider errors
 * can embed request details we do not want to hand to the browser.
 */
const MAX_DIAGNOSTIC_LENGTH = 300;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request: a JSON body is required." },
      { status: 400 },
    );
  }

  const message =
    typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Please paste a message to analyse." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `This message is too long (${message.length} characters). Limit: ${MAX_MESSAGE_LENGTH}.`,
      },
      { status: 413 },
    );
  }

  const startedAt = Date.now();

  try {
    const { result, provider, attempts } = await analyzeMessage(message);

    // Deliberately log metadata only, never the message itself: the content
    // may contain personal or financial details.
    console.log(
      `[CheckSafe] analysed ${message.length} chars in ${Date.now() - startedAt} ms (provider=${provider ?? "none"})`,
    );

    return NextResponse.json({
      ...result,
      meta: {
        provider,
        degraded: provider === null,
        provider_errors: attempts.map((entry) =>
          entry.slice(0, MAX_DIAGNOSTIC_LENGTH),
        ),
        duration_ms: Date.now() - startedAt,
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
    { error: "Use POST with a JSON body containing a 'message' field." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
