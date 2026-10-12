import "server-only";

// Provider-neutral conversation shape used by the agent loop.
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { id: string; name: string; args: Record<string, unknown> };
export type LlmMessage =
  | { role: "user"; text: string }
  // `raw` is the provider's own turn, echoed back unchanged (Gemini needs its thought signatures).
  | { role: "assistant"; text: string; toolCalls: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: Array<{ id: string; name: string; response: Record<string, unknown> }> };
export type LlmRequest = { system: string; messages: LlmMessage[]; tools: ToolSpec[]; temperature: number; maxTokens: number };
export type LlmReply = { text: string; toolCalls: ToolCall[]; raw?: unknown };
// Resolves to null on any provider failure (quota, timeout, outage, malformed reply).
export type Generate = (request: LlmRequest) => Promise<LlmReply | null>;
export type LlmProvider = { id: "gemini" | "groq"; generate: Generate };

const REQUEST_TIMEOUT_MS = 10_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown, label: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error(`${label} request failed`, response.status);
      return null;
    }
    return await response.json();
  } catch (failure) {
    console.error(`${label} request failed`, failure instanceof Error ? failure.name : "Unknown failure");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

type GeminiPart = {
  text?: string;
  thought?: boolean;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

export function geminiProvider(config: { key: string; model: string }): LlmProvider {
  return {
    id: "gemini",
    async generate(request) {
      const contents = request.messages.map((message) => {
        if (message.role === "user") return { role: "user", parts: [{ text: message.text }] };
        if (message.role === "tool") return { role: "user", parts: message.results.map(({ name, response }) => ({ functionResponse: { name, response } })) };
        if (isRecord(message.raw)) return message.raw;
        return { role: "model", parts: [
          ...(message.text ? [{ text: message.text }] : []),
          ...message.toolCalls.map(({ name, args }) => ({ functionCall: { name, args } })),
        ] };
      });
      const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`,
        { "x-goog-api-key": config.key },
        {
          systemInstruction: { parts: [{ text: request.system }] },
          contents,
          tools: [{ functionDeclarations: request.tools }],
          generationConfig: { temperature: request.temperature, maxOutputTokens: request.maxTokens },
        },
        "Gemini",
      ) as { candidates?: Array<{ content?: { parts?: GeminiPart[] } }> } | null;
      const parts = data?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) return null;
      return {
        text: parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("").trim(),
        toolCalls: parts.flatMap((part, index) => part.functionCall
          ? [{ id: `gemini-${index}`, name: part.functionCall.name, args: isRecord(part.functionCall.args) ? part.functionCall.args : {} }]
          : []),
        raw: { role: "model", parts },
      };
    },
  };
}

type OpenAiToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export function groqProvider(config: { key: string; model: string }): LlmProvider {
  return {
    id: "groq",
    async generate(request) {
      const messages = [
        { role: "system", content: request.system },
        ...request.messages.flatMap((message): Array<Record<string, unknown>> => {
          if (message.role === "user") return [{ role: "user", content: message.text }];
          if (message.role === "tool") return message.results.map(({ id, response }) => ({ role: "tool", tool_call_id: id, content: JSON.stringify(response) }));
          return [{
            role: "assistant",
            content: message.text || null,
            ...(message.toolCalls.length ? { tool_calls: message.toolCalls.map(({ id, name, args }) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } })) } : {}),
          }];
        }),
      ];
      const data = await postJson(
        "https://api.groq.com/openai/v1/chat/completions",
        { Authorization: `Bearer ${config.key}` },
        {
          model: config.model,
          messages,
          tools: request.tools.map((tool) => ({ type: "function", function: tool })),
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        },
        "Groq",
      ) as { choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }> } | null;
      const message = data?.choices?.[0]?.message;
      if (!message) return null;
      const toolCalls: ToolCall[] = [];
      for (const call of message.tool_calls ?? []) {
        try {
          const args: unknown = JSON.parse(call.function.arguments || "{}");
          toolCalls.push({ id: call.id, name: call.function.name, args: isRecord(args) ? args : {} });
        } catch {
          return null;
        }
      }
      return { text: (message.content ?? "").trim(), toolCalls };
    },
  };
}

// Providers in fallback order; only those with a key are returned.
export function configuredProviders(env: Record<string, string | undefined> = process.env): LlmProvider[] {
  const providers: LlmProvider[] = [];
  const geminiKey = env.GEMINI_API_KEY?.trim();
  // "-latest" aliases keep working when Google retires a dated free-tier model.
  if (geminiKey) providers.push(geminiProvider({ key: geminiKey, model: env.GEMINI_MODEL?.trim() || "gemini-flash-lite-latest" }));
  const groqKey = env.GROQ_API_KEY?.trim();
  if (groqKey) providers.push(groqProvider({ key: groqKey, model: env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile" }));
  return providers;
}
