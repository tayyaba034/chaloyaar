import "server-only";
import { getDiscoveryAvailability, getNearbyStations } from "@/lib/stations";
import { parseStationSearch, stationAreas } from "@/lib/station-search";
import type { FuelType } from "@/lib/station-data";
import { isVerifiedStation } from "@/lib/station-discovery-facts";

export type AreaId = keyof typeof stationAreas;
export type StationSource = {
  stationId: string;
  name: string;
  distanceKm: number;
  verified: boolean;
  availability: string;
  reportedAt: string | null;
};

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === "string" && Object.hasOwn(stationAreas, value);
}

export function isFuelType(value: unknown): value is FuelType {
  return value === "petrol" || value === "diesel" || value === "cng";
}

const stateScore = (state: string) => state === "available" ? 0 : state === "queue_reported" ? 1 : state === "stale" ? 2 : 3;

// The only source of station facts for both the AI agent and the basic answer.
export async function findStations(input: {
  fuel: FuelType | null;
  areaId: AreaId;
  origin: { latitude: number; longitude: number } | null;
}): Promise<StationSource[]> {
  const search = parseStationSearch({
    radiusKm: 15,
    ...(input.origin ? { lat: input.origin.latitude, lng: input.origin.longitude } : { areaId: input.areaId }),
    ...(input.fuel ? { fuelType: input.fuel } : {}),
  });
  const found = await getNearbyStations(search);
  const stations = found.filter((station) => !input.fuel || station.supportedFuels.includes(input.fuel));
  const facts = await getDiscoveryAvailability(stations.map((station) => station.id), input.fuel ?? "petrol");
  return stations.slice(0, 5).map((station) => ({
    stationId: station.id,
    name: station.name,
    distanceKm: station.distanceKm,
    verified: isVerifiedStation(station),
    availability: facts[station.id]?.state ?? "unknown",
    reportedAt: facts[station.id]?.reportedAt ?? null,
  })).sort((a, b) => stateScore(a.availability) - stateScore(b.availability) || a.distanceKm - b.distanceKm);
}

export function formatReportTime(reportedAt: string) {
  return new Date(reportedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" });
}
