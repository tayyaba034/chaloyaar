import { NextResponse } from "next/server";

const supportedLocales = new Set(["ur", "en", "ur-Latn", "pa-Arab"]);

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } },
        { status: 400 },
      );
    }
    throw error;
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("text" in body) ||
    !("locale" in body) ||
    typeof body.text !== "string" ||
    body.text.trim().length === 0 ||
    body.text.length > 1200 ||
    typeof body.locale !== "string" ||
    !supportedLocales.has(body.locale)
  ) {
    return NextResponse.json(
      { error: { code: "INVALID_TTS_REQUEST", message: "Text or language is not supported." } },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      error: {
        code: "TTS_NOT_CONFIGURED",
        message: "Cloud speech is not configured for this build.",
      },
    },
    { status: 503 },
  );
}
