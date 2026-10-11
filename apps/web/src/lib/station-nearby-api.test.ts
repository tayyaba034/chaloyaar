import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Station } from "./station-data";

const mocks = vi.hoisted(() => ({ nearby: vi.fn(), facts: vi.fn() }));
vi.mock("@/lib/stations", () => ({ getNearbyStations: mocks.nearby, getDiscoveryAvailability: mocks.facts }));
import { POST } from "@/app/api/stations/nearby/route";

const station: Station & { distanceKm: number; distanceKind: string } = {
  id: "11111111-1111-4111-8111-111111111111", name: "Synthetic test record",
  brand: null, address: null, latitude: 31.4, longitude: 73.1,
  supportedFuels: ["petrol"], verificationStatus: "verified", isDemo: false,
  source: "Fixture", sourceUrl: null, updatedAt: null, verifiedAt: "2020-01-01T00:00:00Z",
  distanceKm: 1, distanceKind: "straight_line_approximate",
};
const request = (body: unknown) => new NextRequest("http://localhost/api/stations/nearby", {
  method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
});

beforeEach(() => { vi.resetAllMocks(); mocks.nearby.mockResolvedValue([]); mocks.facts.mockResolvedValue({}); });
describe("nearby station API", () => {
  it("uses manual area coordinates when location is not shared", async () => {
    const response = await POST(request({ areaId: "susan-road" }));
    expect(response.status).toBe(200);
    expect(mocks.nearby).toHaveBeenCalledWith({ latitude: 31.4077, longitude: 73.0912, radiusKm: 15, fuelType: null });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("preserves database nearby order and labels distance, without sample fallback", async () => {
    mocks.nearby.mockResolvedValue([station, { ...station, id: "second", distanceKm: 2, verificationStatus: "unverified", supportedFuels: [] }, { ...station, id: "sample", isDemo: true }]);
    const data = await (await POST(request({ lat: 31.4, lng: 73.1 }))).json();
    expect(data.stations.map((s: Station) => s.id)).toEqual([station.id, "second"]);
    expect(data.stations[1].availability.state).toBe("unknown");
    expect(data.stations[0].distanceKind).toBe("straight_line_approximate");
  });
  it("rejects unverified recorded fuel even with the older database RPC", async () => {
    mocks.nearby.mockResolvedValue([station, { ...station, id: "unverified", verificationStatus: "unverified" }, { ...station, id: "unknown", supportedFuels: [] }]);
    const data = await (await POST(request({ areaId: "city-centre", fuelType: "petrol" }))).json();
    expect(data.stations.map((s: Station) => s.id)).toEqual([station.id]);
  });
  it("passes through the same metadata and safe availability as details", async () => {
    const fact = { state: "available", source: "station", reportedAt: "2020-01-01", expiresAt: "2020-01-02" };
    mocks.nearby.mockResolvedValue([station]); mocks.facts.mockResolvedValue({ [station.id]: fact });
    const data = await (await POST(request({ areaId: "city-centre" }))).json();
    expect(data.stations[0]).toEqual({ ...station, availability: fact });
  });
  it("returns a real empty set and a distinct error on database failure", async () => {
    expect((await (await POST(request({ areaId: "city-centre" }))).json()).stations).toEqual([]);
    mocks.nearby.mockRejectedValue(new Error("unavailable"));
    const response = await POST(request({ areaId: "city-centre" }));
    expect(response.status).toBe(503);
    expect((await response.json()).stations).toBeUndefined();
  });
});
