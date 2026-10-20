import { NextResponse } from "next/server";

import { analyzeMessage } from "@/lib/analyze";
import { MAX_MESSAGE_LENGTH } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requete invalide : un corps JSON est attendu." },
      { status: 400 },
    );
  }

  const message = typeof payload?.message === "string" ? payload.message.trim() : "";

  if (!message) {
    return NextResponse.json(
      { error: "Merci de coller un message a analyser." },
      { status: 400 },
    );
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      {
        error: `Ce message est trop long (${message.length} caracteres). Limite : ${MAX_MESSAGE_LENGTH}.`,
      },
      { status: 413 },
    );
  }

  const startedAt = Date.now();
  try {
    const { result, provider, attempts } = await analyzeMessage(message);
    return NextResponse.json({
      ...result,
      meta: {
        provider,
        degraded: provider === null,
        provider_errors: attempts,
        duration_ms: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error("[CheckSafe] erreur inattendue -", error);
    return NextResponse.json(
      { error: "Une erreur inattendue est survenue pendant l'analyse." },
      { status: 500 },
    );
  }
}
