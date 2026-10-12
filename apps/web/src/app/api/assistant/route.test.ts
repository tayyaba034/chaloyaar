import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ nearby: vi.fn(), facts: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stations", () => ({
  getNearbyStations: mocks.nearby,
  getDiscoveryAvailability: mocks.facts,
}));
import { POST } from "./route";
import { resetAssistantRateLimit } from "@/lib/assistant/rate-limit";

const request = (body: unknown) => new NextRequest("http://localhost/api/assistant", {
  method: "POST",
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json" },
});

const station = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Verified Petrol Station",
  brand: null,
  address: "City Centre",
  latitude: 31.4,
  longitude: 73.1,
  supportedFuels: ["petrol" as const],
  verificationStatus: "verified" as const,
  isDemo: false,
  source: "Admin review",
  sourceUrl: null,
  updatedAt: null,
  verifiedAt: "2020-01-01T00:00:00Z",
  distanceKm: 2.4,
  distanceKind: "straight_line_approximate" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv("GEMINI_API_KEY", "");
  resetAssistantRateLimit();
  mocks.nearby.mockResolvedValue([station]);
  mocks.facts.mockResolvedValue({
    [station.id]: {
      state: "available",
      source: "station",
      reportedAt: "2026-10-11T15:20:00Z",
      expiresAt: "2026-10-11T16:20:00Z",
    },
  });
});

describe("assistant API", () => {
  it("returns grounded station sources for a fuel question", async () => {
    const response = await POST(request({ message: "Find petrol near D-Ground", locale: "en" }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.sources[0]).toMatchObject({
      stationId: station.id,
      availability: "available",
      verified: true,
    });
    expect(data.answer).toContain("Verified Petrol Station");
  });

  it("rejects empty or oversized messages", async () => {
    expect((await POST(request({ message: "" }))).status).toBe(400);
    expect((await POST(request({ message: "x".repeat(501) }))).status).toBe(400);
    expect(mocks.nearby).not.toHaveBeenCalled();
  });

  it("uses the Gemini agent when configured and labels the answer", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const replies = [
      { parts: [{ functionCall: { name: "find_stations", args: { area: "d-ground", fuel: "petrol" } } }] },
      { parts: [{ text: "Verified Petrol Station is 2.4 km away; a report says petrol is available." }] },
    ];
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { role: "model", ...replies.shift() } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const data = await (await POST(request({ message: "petrol D-Ground?", locale: "en" }))).json();
    expect(data.mode).toBe("ai");
    expect(data.answer).toContain("2.4 km");
    expect(data.sources[0].stationId).toBe(station.id);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to the basic answer when Gemini fails", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("quota", { status: 429 })));
    const data = await (await POST(request({ message: "Find petrol near D-Ground", locale: "en" }))).json();
    expect(data.mode).toBe("basic");
    expect(data.answer).toContain("Verified Petrol Station");
  });

  it("rate limits one client", async () => {
    for (let count = 0; count < 8; count += 1) expect((await POST(request({ message: "petrol" }))).status).toBe(200);
    expect((await POST(request({ message: "petrol" }))).status).toBe(429);
  });

  it("does not fabricate a result when no verified fuel station exists", async () => {
    mocks.nearby.mockResolvedValue([]);
    const data = await (await POST(request({ message: "Where is diesel?", locale: "ur" }))).json();
    expect(data.sources).toEqual([]);
    expect(data.answer).toContain("تصدیق شدہ");
  });
});
