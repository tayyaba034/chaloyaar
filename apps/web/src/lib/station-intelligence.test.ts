import { describe, expect, it } from "vitest";
import { buildIntelligence, type IntelligenceReport } from "./station-intelligence";

const stations = [
  { id: "a", name: "A", latitude: 31.4181, longitude: 73.0791, supportedFuels: ["petrol"], verificationStatus: "verified" },
  { id: "b", name: "B", latitude: 31.4182, longitude: 73.0792, supportedFuels: [], verificationStatus: "unverified" },
  { id: "c", name: "C", latitude: 31.45, longitude: 73.13, supportedFuels: ["diesel"], verificationStatus: "unverified" },
];
const now = Date.parse("2026-10-12T10:00:00Z");
const report = (patch: Partial<IntelligenceReport>): IntelligenceReport => ({
  stationId: "a", fuelType: "petrol", status: "available", sourceType: "user",
  reportedAt: "2026-10-12T09:00:00Z", expiresAt: "2026-10-12T11:00:00Z", ...patch,
});

describe("station intelligence", () => {
  it("returns honest zeros and empty layers when there are no reports", () => {
    const result = buildIntelligence(stations, [], now);
    expect(result.reportHexes.features).toEqual([]);
    expect(result.stats).toMatchObject({ stations: 3, stationsWithFuelData: 2, verifiedStations: 1, reports: 0, freshReports: 0, conflictingStations: 0, lastReportAt: null });
    expect(result.stationHexes.features.map((feature) => feature.properties.stations).sort()).toEqual([1, 2]);
  });

  it("counts fresh reports and conflicts within 30 minutes", () => {
    const result = buildIntelligence(stations, [
      report({}),
      report({ status: "unavailable", reportedAt: "2026-10-12T09:20:00Z" }),
      report({ stationId: "c", fuelType: "diesel", status: "unavailable", reportedAt: "2026-10-12T05:00:00Z", expiresAt: "2026-10-12T07:00:00Z" }),
    ], now);
    expect(result.stats).toMatchObject({ reports: 3, freshReports: 2, conflictingStations: 1, lastReportAt: "2026-10-12T09:20:00Z" });
    const hexA = result.reportHexes.features.find((feature) => feature.properties.reports === 2)!;
    expect(hexA.properties).toMatchObject({ available: 1, unavailable: 1, queue: 0 });
  });

  it("ignores reports for stations it does not know", () => {
    expect(buildIntelligence(stations, [report({ stationId: "zzz" })], now).reportHexes.features).toEqual([]);
  });
});
