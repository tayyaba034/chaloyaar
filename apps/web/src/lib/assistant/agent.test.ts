import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/stations", () => ({ getNearbyStations: vi.fn(), getDiscoveryAvailability: vi.fn() }));
import { answerIsGrounded, runAgent } from "./agent";
import type { GeminiContent, GeminiRequest } from "./gemini";

const source = {
  stationId: "11111111-1111-4111-8111-111111111111",
  name: "Verified Petrol Station",
  distanceKm: 2.43,
  verified: true,
  availability: "available",
  reportedAt: null,
};

const model = (...parts: GeminiContent["parts"]): GeminiContent => ({ role: "model", parts });

describe("assistant agent", () => {
  it("answers from a find_stations call without sending coordinates to the model", async () => {
    const requests: GeminiRequest[] = [];
    const replies = [
      model({ functionCall: { name: "find_stations", args: { fuel: "petrol" } }, thoughtSignature: "sig" }),
      model({ text: "Verified Petrol Station is about 2.4 km away and was reported available." }),
    ];
    const findStations = vi.fn().mockResolvedValue([source]);
    const result = await runAgent({
      message: "petrol near me",
      locale: "en",
      origin: { latitude: 31.41234, longitude: 73.08765 },
      generate: async (request) => { requests.push(structuredClone(request)); return replies.shift()!; },
      findStations,
    });
    expect(result?.answer).toContain("2.4 km");
    expect(result?.sources).toEqual([source]);
    expect(findStations).toHaveBeenCalledWith({ fuel: "petrol", areaId: "city-centre", origin: { latitude: 31.41234, longitude: 73.08765 } });
    expect(JSON.stringify(requests)).not.toMatch(/31\.41|73\.08/);
    expect(requests[1].contents[1].parts[0].thoughtSignature).toBe("sig");
  });

  it("rejects an answer that invents a number", async () => {
    const replies = [
      model({ functionCall: { name: "find_stations", args: {} } }),
      model({ text: "Petrol costs 265 rupees at Verified Petrol Station." }),
    ];
    const result = await runAgent({
      message: "price?", locale: "en", origin: null,
      generate: async () => replies.shift()!, findStations: vi.fn().mockResolvedValue([source]),
    });
    expect(result).toBeNull();
  });

  it("offers the help form for a breakdown but never submits a request", async () => {
    const replies = [
      model({ functionCall: { name: "roadside_help", args: { service: "puncture" } } }),
      model({ text: "Open the help form below to ask a nearby provider for a quote." }),
    ];
    const result = await runAgent({
      message: "my tyre is flat", locale: "en", origin: null,
      generate: async () => replies.shift()!, findStations: vi.fn(),
    });
    expect(result?.action).toEqual({ type: "roadside_help", serviceType: "puncture", href: "/app/help" });
  });

  it("gives up after three model turns or a failed model call", async () => {
    const loop = vi.fn().mockResolvedValue(model({ functionCall: { name: "find_stations", args: {} } }));
    expect(await runAgent({ message: "x", locale: "en", origin: null, generate: loop, findStations: vi.fn().mockResolvedValue([]) })).toBeNull();
    expect(loop).toHaveBeenCalledTimes(3);
    expect(await runAgent({ message: "x", locale: "en", origin: null, generate: async () => null, findStations: vi.fn() })).toBeNull();
  });

  it("checks Urdu digits against tool results", () => {
    expect(answerIsGrounded("اسٹیشن ۲.۴ کلومیٹر دور ہے", [source])).toBe(true);
    expect(answerIsGrounded("اسٹیشن ۹ کلومیٹر دور ہے", [source])).toBe(false);
  });
});
