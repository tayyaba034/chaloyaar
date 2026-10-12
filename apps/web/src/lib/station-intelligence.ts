import { hexbin } from "@geo/hexbin.ts";
import { stationAreas } from "./station-search";

// Builds the Station Intelligence view from real rows only. Nothing here is estimated or invented:
// empty data produces empty layers and zero counts.

export type IntelligenceStation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  supportedFuels: string[];
  verificationStatus: string;
};

export type IntelligenceReport = {
  stationId: string;
  fuelType: string;
  status: "available" | "unavailable" | "queue_reported";
  sourceType: string;
  reportedAt: string;
  expiresAt: string;
};

type Polygon = { type: "Polygon"; coordinates: number[][][] };
export type HexFeature = { type: "Feature"; geometry: Polygon; properties: Record<string, number | string> };
export type HexCollection = { type: "FeatureCollection"; features: HexFeature[] };

export const HEX_SIZE_METRES = 700;
const CONFLICT_WINDOW_MS = 30 * 60_000;

export function buildIntelligence(stations: IntelligenceStation[], reports: IntelligenceReport[], now = Date.now()) {
  const origin = stationAreas["city-centre"];
  const byId = new Map(stations.map((station) => [station.id, station]));

  const stationCells = hexbin(stations.map((station) => ({ ...station })), HEX_SIZE_METRES, origin);
  const stationHexes: HexCollection = {
    type: "FeatureCollection",
    features: stationCells.map((cell) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cell.polygon] },
      properties: {
        id: cell.id,
        stations: cell.items.length,
        withFuelData: cell.items.filter((item) => item.supportedFuels.length > 0).length,
        verified: cell.items.filter((item) => item.verificationStatus === "verified").length,
      },
    })),
  };

  const located = reports.flatMap((report) => {
    const station = byId.get(report.stationId);
    return station ? [{ ...report, latitude: station.latitude, longitude: station.longitude }] : [];
  });
  const reportCells = hexbin(located, HEX_SIZE_METRES, origin);
  const reportHexes: HexCollection = {
    type: "FeatureCollection",
    features: reportCells.map((cell) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [cell.polygon] },
      properties: {
        id: cell.id,
        reports: cell.items.length,
        available: cell.items.filter((item) => item.status === "available").length,
        unavailable: cell.items.filter((item) => item.status === "unavailable").length,
        queue: cell.items.filter((item) => item.status === "queue_reported").length,
        latest: cell.items.map((item) => item.reportedAt).sort().at(-1) ?? "",
      },
    })),
  };

  // Conflicts: same station and fuel, one report says available and another says unavailable,
  // within 30 minutes of each other.
  const groups = new Map<string, IntelligenceReport[]>();
  for (const report of reports) {
    const key = `${report.stationId}:${report.fuelType}`;
    groups.set(key, [...(groups.get(key) ?? []), report]);
  }
  let conflictingStations = 0;
  for (const group of groups.values()) {
    const available = group.filter((report) => report.status === "available").map((report) => Date.parse(report.reportedAt));
    const unavailable = group.filter((report) => report.status === "unavailable").map((report) => Date.parse(report.reportedAt));
    if (available.some((a) => unavailable.some((u) => Math.abs(a - u) <= CONFLICT_WINDOW_MS))) conflictingStations += 1;
  }

  const fresh = reports.filter((report) => Date.parse(report.expiresAt) > now);
  return {
    stationHexes,
    reportHexes,
    stats: {
      stations: stations.length,
      stationsWithFuelData: stations.filter((station) => station.supportedFuels.length > 0).length,
      verifiedStations: stations.filter((station) => station.verificationStatus === "verified").length,
      reports: reports.length,
      freshReports: fresh.length,
      conflictingStations,
      lastReportAt: reports.map((report) => report.reportedAt).sort().at(-1) ?? null,
    },
  };
}
