import { describe, expect, it } from "vitest";
import { discoveryFacts, isVerifiedStation, matchesDiscoveryFuel } from "./station-discovery-facts";
import type { Station } from "./station-data";

const station: Station = {
  id: "11111111-1111-4111-8111-111111111111", name: "Synthetic test record",
  brand: null, address: null, latitude: 31.4, longitude: 73.1,
  supportedFuels: ["petrol"], verificationStatus: "verified", isDemo: false,
  source: "Test fixture", sourceUrl: null, updatedAt: null, verifiedAt: "2020-01-01T00:00:00Z",
};
const report = { state: "available" as const, source: "station" as const, reportedAt: "2020-01-01", expiresAt: "2020-01-02" };

describe("discovery trust boundaries shared by search and details", () => {
  it("matches only confirmed fuel types", () => {
    expect(matchesDiscoveryFuel(station, "petrol")).toBe(true);
    expect(matchesDiscoveryFuel(station, "diesel")).toBe(false);
    expect(matchesDiscoveryFuel({ ...station, supportedFuels: [] }, "petrol")).toBe(false);
  });
  it.each(["unverified", "pending", "rejected"] as const)("does not confirm %s metadata", verificationStatus => {
    expect(matchesDiscoveryFuel({ ...station, verificationStatus }, "petrol")).toBe(false);
    expect(isVerifiedStation({ ...station, verificationStatus })).toBe(false);
  });
  it.each([null, "invalid", "2999-01-01"])("requires a real, past verification date: %s", verifiedAt => {
    expect(matchesDiscoveryFuel({ ...station, verifiedAt }, "petrol")).toBe(false);
  });
  it("keeps real leads in All but never sample or rejected records", () => {
    expect(matchesDiscoveryFuel({ ...station, verificationStatus: "unverified" }, null)).toBe(true);
    expect(matchesDiscoveryFuel({ ...station, isDemo: true }, null)).toBe(false);
    expect(matchesDiscoveryFuel({ ...station, verificationStatus: "rejected" }, null)).toBe(false);
  });
  it("uses identical report facts for known metadata and Unknown otherwise", () => {
    expect(discoveryFacts(station, "petrol", report)).toEqual(report);
    expect(discoveryFacts(station, "petrol")).toEqual({ state: "unknown", source: null, reportedAt: null, expiresAt: null });
    expect(discoveryFacts({ ...station, supportedFuels: [] }, "petrol", report).state).toBe("unknown");
    expect(discoveryFacts({ ...station, verificationStatus: "unverified" }, "petrol", report).state).toBe("unknown");
  });
});
