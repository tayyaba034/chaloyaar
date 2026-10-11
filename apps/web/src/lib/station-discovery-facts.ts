import type { FuelType, Station } from "./station-data";

export type DiscoveryAvailability = {
  state: "available" | "unavailable" | "queue_reported" | "unknown" | "stale";
  source: "user" | "station" | "admin" | null;
  reportedAt: string | null;
  expiresAt: string | null;
};

export function isVerifiedStation(station: Station, now = Date.now()) {
  const checked = Date.parse(station.verifiedAt ?? "");
  return !station.isDemo && station.verificationStatus === "verified"
    && Number.isFinite(checked) && checked <= now;
}

export function matchesDiscoveryFuel(station: Station, fuel: FuelType | null) {
  return !station.isDemo && station.verificationStatus !== "rejected"
    && (!fuel || (isVerifiedStation(station) && station.supportedFuels.includes(fuel)));
}

// A stock observation does not verify the station's identity or fuel metadata.
export function discoveryFacts(station: Station, fuel: FuelType, report?: DiscoveryAvailability): DiscoveryAvailability {
  if (!matchesDiscoveryFuel(station, fuel) || !report) {
    return { state: "unknown", source: null, reportedAt: null, expiresAt: null };
  }
  return report;
}
