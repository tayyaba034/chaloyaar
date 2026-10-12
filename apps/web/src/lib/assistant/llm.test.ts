import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { configuredProviders, geminiProvider, groqProvider, type LlmRequest } from "./llm";

const tool = { name: "find_stations", description: "Find stations", parameters: { type: "object", properties: {} } };
const conversation: LlmRequest = {
  system: "Be brief.",
  tools: [tool],
  temperature: 0.2,
  maxTokens: 100,
  messages: [
    { role: "user", text: "petrol?" },
    { role: "assistant", text: "", toolCalls: [{ id: "call-1", name: "find_stations", args: { fuel: "petrol" } }], raw: { role: "model", parts: [{ functionCall: { name: "find_stations", args: { fuel: "petrol" } }, thoughtSignature: "sig" }] } },
    { role: "tool", results: [{ id: "call-1", name: "find_stations", response: { stations: [] } }] },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("LLM providers", () => {
  it("sends Gemini its own turn back and reads function calls", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ candidates: [{ content: { parts: [
      { text: "thinking", thought: true },
      { functionCall: { name: "find_stations", args: { area: "d-ground" } } },
    ] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const reply = await geminiProvider({ key: "k", model: "m" }).generate(conversation);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.contents[1].parts[0].thoughtSignature).toBe("sig");
    expect(body.contents[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "find_stations", response: { stations: [] } } }] });
    expect(body.tools[0].functionDeclarations[0].name).toBe("find_stations");
    expect(reply).toMatchObject({ text: "", toolCalls: [{ name: "find_stations", args: { area: "d-ground" } }] });
  });

  it("maps the conversation to OpenAI-style messages for Groq", async () => {
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ choices: [{ message: { content: null, tool_calls: [
      { id: "t1", type: "function", function: { name: "find_stations", arguments: "{\"fuel\":\"diesel\"}" } },
    ] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const reply = await groqProvider({ key: "k", model: "m" }).generate(conversation);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages.map((message: { role: string }) => message.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(body.messages[2].tool_calls[0].function).toEqual({ name: "find_stations", arguments: "{\"fuel\":\"petrol\"}" });
    expect(body.messages[3]).toEqual({ role: "tool", tool_call_id: "call-1", content: "{\"stations\":[]}" });
    expect(reply).toEqual({ text: "", toolCalls: [{ id: "t1", name: "find_stations", args: { fuel: "diesel" } }] });
  });

  it("returns null on quota errors and malformed tool arguments", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    expect(await geminiProvider({ key: "k", model: "m" }).generate(conversation)).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ message: { tool_calls: [{ id: "t", type: "function", function: { name: "x", arguments: "{bad" } }] } }] })));
    expect(await groqProvider({ key: "k", model: "m" }).generate(conversation)).toBeNull();
  });

  it("orders configured providers Gemini then Groq", () => {
    expect(configuredProviders({ GROQ_API_KEY: "g", GEMINI_API_KEY: "m" }).map((provider) => provider.id)).toEqual(["gemini", "groq"]);
    expect(configuredProviders({ GROQ_API_KEY: " " })).toEqual([]);
  });
});
