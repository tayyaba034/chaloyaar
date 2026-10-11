import type { FuelType } from "./station-data";

export const stationAreas = {
  "city-centre": { latitude: 31.4181, longitude: 73.0791 },
  "susan-road": { latitude: 31.4077, longitude: 73.0912 },
  "d-ground": { latitude: 31.4093, longitude: 73.112 },
} as const;

export type StationSearch = { latitude: number; longitude: number; radiusKm: number; fuelType: FuelType | null };

function numeric(value: unknown): number {
  if (typeof value !== "number" && typeof value !== "string") return NaN;
  if (typeof value === "string" && !value.trim()) return NaN;
  return Number(value);
}

export function parseStationSearch(input: Record<string, unknown>): StationSearch {
  const radiusKm = numeric(input.radiusKm ?? 15);
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 30) throw new Error("Radius must be between 1 and 30 km.");
  const fuelType = input.fuelType ?? null;
  if (fuelType !== null && fuelType !== "petrol" && fuelType !== "diesel" && fuelType !== "cng") throw new Error("Choose a valid fuel type.");
  let latitude: number;
  let longitude: number;
  if (input.lat !== undefined || input.lng !== undefined) {
    latitude = numeric(input.lat);
    longitude = numeric(input.lng);
  } else if (typeof input.areaId === "string" && Object.hasOwn(stationAreas, input.areaId)) {
    ({ latitude, longitude } = stationAreas[input.areaId as keyof typeof stationAreas]);
  } else throw new Error("Choose a supported area or allow location access.");
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Choose a valid map location.");
  return { latitude, longitude, radiusKm, fuelType };
}
