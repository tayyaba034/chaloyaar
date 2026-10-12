import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ nearby: vi.fn(), facts: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/stations", () => ({
  getNearbyStations: mocks.nearby,
  getDiscoveryAvailability: mocks.facts,
}));
import { POST } from "./route";

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

  it("does not fabricate a result when no verified fuel station exists", async () => {
    mocks.nearby.mockResolvedValue([]);
    const data = await (await POST(request({ message: "Where is diesel?", locale: "ur" }))).json();
    expect(data.sources).toEqual([]);
    expect(data.answer).toContain("تصدیق شدہ");
  });
});
