import "server-only";

export type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
};
export type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
export type GeminiRequest = {
  systemInstruction: { parts: GeminiPart[] };
  contents: GeminiContent[];
  tools: Array<{ functionDeclarations: unknown[] }>;
  generationConfig: Record<string, unknown>;
};
export type Generate = (request: GeminiRequest) => Promise<GeminiContent | null>;

const REQUEST_TIMEOUT_MS = 10_000;

export function getGeminiConfig() {
  const key = process.env.GEMINI_API_KEY?.trim() ?? "";
  // A "-latest" alias keeps working when Google retires a dated free-tier model.
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest";
  return key ? { key, model } : null;
}

// Returns null on any failure (quota, timeout, outage) so callers fall back to the basic answer.
export function geminiGenerate(config: { key: string; model: string }): Generate {
  return async (request) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": config.key },
          body: JSON.stringify(request),
          signal: controller.signal,
          cache: "no-store",
        },
      );
      if (!response.ok) {
        console.error("Gemini request failed", response.status);
        return null;
      }
      const data = await response.json() as { candidates?: Array<{ content?: GeminiContent }> };
      const content = data.candidates?.[0]?.content;
      return content && Array.isArray(content.parts) ? { role: "model", parts: content.parts } : null;
    } catch (failure) {
      console.error("Gemini request failed", failure instanceof Error ? failure.name : "Unknown failure");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}
