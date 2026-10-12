import type { LatLng } from "./types.ts";

// Pilot area used for warnings only; coordinates outside it are still valid.
export const faisalabadBounds = { south: 31.3, west: 72.95, north: 31.55, east: 73.25 };

export type CoordinateCheck = { valid: true; point: LatLng; warnings: string[] } | { valid: false; message: string };

export function checkCoordinates(latitude: unknown, longitude: unknown): CoordinateCheck {
  const lat = typeof latitude === "string" && latitude.trim() !== "" ? Number(latitude) : latitude;
  const lng = typeof longitude === "string" && longitude.trim() !== "" ? Number(longitude) : longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { valid: false, message: "Latitude and longitude must be numbers." };
  }
  if (lat < -90 || lat > 90) return { valid: false, message: "Latitude must be between -90 and 90." };
  if (lng < -180 || lng > 180) return { valid: false, message: "Longitude must be between -180 and 180." };
  const warnings = isInPilotArea({ latitude: lat, longitude: lng }) ? [] : ["outside_pilot_area"];
  return { valid: true, point: { latitude: lat, longitude: lng }, warnings };
}

export function isInPilotArea(point: LatLng) {
  return point.latitude >= faisalabadBounds.south && point.latitude <= faisalabadBounds.north
    && point.longitude >= faisalabadBounds.west && point.longitude <= faisalabadBounds.east;
}

// Accepts "31.418, 73.079" or "31.418 73.079" typed by a user.
export function parseCoordinateText(text: string): LatLng | null {
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!match) return null;
  const check = checkCoordinates(Number(match[1]), Number(match[2]));
  return check.valid ? check.point : null;
}
