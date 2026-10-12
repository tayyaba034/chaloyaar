import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stations", () => ({ getNearbyStations: vi.fn(), getDiscoveryAvailability: vi.fn() }));
import { answerIsGrounded, runAgent } from "./agent";
import type { LlmReply, LlmRequest } from "./llm";

const source = {
  stationId: "11111111-1111-4111-8111-111111111111",
  name: "Verified Petrol Station",
  distanceKm: 2.43,
  verified: true,
  availability: "available",
  reportedAt: null,
};

const call = (name: string, args: Record<string, unknown> = {}, raw?: unknown): LlmReply => ({ text: "", toolCalls: [{ id: `call-${name}`, name, args }], raw });
const say = (text: string): LlmReply => ({ text, toolCalls: [] });

describe("assistant agent", () => {
  it("answers from a find_stations call without sending coordinates to the model", async () => {
    const requests: LlmRequest[] = [];
    const replies = [call("find_stations", { fuel: "petrol" }, { role: "model", parts: [{ thoughtSignature: "sig" }] }), say("Verified Petrol Station is about 2.4 km away and was reported available.")];
    const findStations = vi.fn().mockResolvedValue([source]);
    const outcome = await runAgent({
      message: "petrol near me",
      locale: "en",
      origin: { latitude: 31.41234, longitude: 73.08765 },
      generate: async (request) => { requests.push(structuredClone(request)); return replies.shift()!; },
      findStations,
    });
    expect(outcome.ok && outcome.result.answer).toContain("2.4 km");
    expect(outcome.ok && outcome.result.sources).toEqual([source]);
    expect(findStations).toHaveBeenCalledWith({ fuel: "petrol", areaId: "city-centre", origin: { latitude: 31.41234, longitude: 73.08765 } });
    expect(JSON.stringify(requests)).not.toMatch(/31\.41|73\.08/);
    expect(requests[1].messages[1]).toMatchObject({ role: "assistant", raw: { parts: [{ thoughtSignature: "sig" }] } });
    expect(requests[1].messages[2]).toMatchObject({ role: "tool", results: [{ id: "call-find_stations", name: "find_stations" }] });
  });

  it("rejects an answer that invents a number", async () => {
    const replies = [call("find_stations"), say("Petrol costs 265 rupees at Verified Petrol Station.")];
    const outcome = await runAgent({
      message: "price?", locale: "en", origin: null,
      generate: async () => replies.shift()!, findStations: vi.fn().mockResolvedValue([source]),
    });
    expect(outcome).toEqual({ ok: false, reason: "unusable" });
  });

  it("offers the help form for a breakdown but never submits a request", async () => {
    const replies = [call("roadside_help", { service: "puncture" }), say("Open the help form below to ask a nearby provider for a quote.")];
    const outcome = await runAgent({
      message: "my tyre is flat", locale: "en", origin: null,
      generate: async () => replies.shift()!, findStations: vi.fn(),
    });
    expect(outcome.ok && outcome.result.action).toEqual({ type: "roadside_help", serviceType: "puncture", href: "/app/help" });
  });

  it("gives up after three model turns, and reports provider failures separately", async () => {
    const loop = vi.fn().mockResolvedValue(call("find_stations"));
    expect(await runAgent({ message: "x", locale: "en", origin: null, generate: loop, findStations: vi.fn().mockResolvedValue([]) })).toEqual({ ok: false, reason: "unusable" });
    expect(loop).toHaveBeenCalledTimes(3);
    expect(await runAgent({ message: "x", locale: "en", origin: null, generate: async () => null, findStations: vi.fn() })).toEqual({ ok: false, reason: "provider_error" });
  });

  it("checks Urdu digits against tool results", () => {
    expect(answerIsGrounded("اسٹیشن ۲.۴ کلومیٹر دور ہے", [source])).toBe(true);
    expect(answerIsGrounded("اسٹیشن ۹ کلومیٹر دور ہے", [source])).toBe(false);
  });
});
