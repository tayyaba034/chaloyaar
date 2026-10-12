import { straightLineKm } from "./distance.ts";
import type { FetchFn, LatLng } from "./types.ts";

export type MatrixSource = "ors" | "osrm" | "straight_line";
export type MatrixCell = { distanceKm: number; durationMin: number; source: MatrixSource };
export type TravelMatrix = {
  cells: MatrixCell[][];
  estimateKind: "road" | "straight_line" | "mixed";
  providers: MatrixSource[];
  notes: string[];
};

export type RoutingConfig = {
  orsApiKey?: string | null;
  osrmBaseUrl?: string | null;
  // Assumed average urban speed for straight-line fallbacks, stated to the user as an assumption.
  fallbackSpeedKmh?: number;
  timeoutMs?: number;
  fetchFn?: FetchFn;
};

export const DEFAULT_FALLBACK_SPEED_KMH = 25;
const MAX_POINTS = 25;

type Raw = { distanceKm: (number | null)[][]; durationMin: (number | null)[][] };

async function withTimeout(fetchFn: FetchFn, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const finiteOrNull = (value: unknown, scale: number) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value * scale : null;

async function orsMatrix(points: LatLng[], key: string, fetchFn: FetchFn, timeoutMs: number): Promise<Raw | null> {
  const response = await withTimeout(fetchFn, "https://api.openrouteservice.org/v2/matrix/driving-car", {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ locations: points.map((p) => [p.longitude, p.latitude]), metrics: ["distance", "duration"], units: "km" }),
  }, timeoutMs);
  if (!response.ok) return null;
  const body = await response.json() as { distances?: unknown[][]; durations?: unknown[][] };
  if (!Array.isArray(body.distances) || !Array.isArray(body.durations)) return null;
  return {
    distanceKm: body.distances.map((row) => (Array.isArray(row) ? row : []).map((value) => finiteOrNull(value, 1))),
    durationMin: body.durations.map((row) => (Array.isArray(row) ? row : []).map((value) => finiteOrNull(value, 1 / 60))),
  };
}

async function osrmMatrix(points: LatLng[], baseUrl: string, fetchFn: FetchFn, timeoutMs: number): Promise<Raw | null> {
  const coordinates = points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(";");
  const response = await withTimeout(fetchFn, `${baseUrl.replace(/\/$/, "")}/table/v1/driving/${coordinates}?annotations=distance,duration`, { headers: { Accept: "application/json" } }, timeoutMs);
  if (!response.ok) return null;
  const body = await response.json() as { code?: string; distances?: unknown[][]; durations?: unknown[][] };
  if (body.code !== "Ok" || !Array.isArray(body.distances) || !Array.isArray(body.durations)) return null;
  return {
    distanceKm: body.distances.map((row) => (Array.isArray(row) ? row : []).map((value) => finiteOrNull(value, 1 / 1000))),
    durationMin: body.durations.map((row) => (Array.isArray(row) ? row : []).map((value) => finiteOrNull(value, 1 / 60))),
  };
}

function straightLineCell(from: LatLng, to: LatLng, speedKmh: number): MatrixCell {
  const distanceKm = straightLineKm(from, to);
  return { distanceKm, durationMin: (distanceKm / speedKmh) * 60, source: "straight_line" };
}

/**
 * Builds an all-pairs travel matrix. Road providers are tried in order (ORS, then OSRM); any
 * cell a provider cannot fill falls back to a labelled straight-line estimate on its own.
 */
export async function buildTravelMatrix(points: LatLng[], config: RoutingConfig = {}): Promise<TravelMatrix> {
  if (points.length < 1) throw new RangeError("At least one point is required.");
  if (points.length > MAX_POINTS) throw new RangeError(`At most ${MAX_POINTS} points are supported.`);
  const fetchFn = config.fetchFn ?? ((input, init) => fetch(input, init));
  const speed = config.fallbackSpeedKmh ?? DEFAULT_FALLBACK_SPEED_KMH;
  const timeoutMs = config.timeoutMs ?? 8000;
  const notes: string[] = [];
  let raw: Raw | null = null;
  let provider: MatrixSource | null = null;

  if (config.orsApiKey) {
    raw = await orsMatrix(points, config.orsApiKey, fetchFn, timeoutMs).catch(() => null);
    if (raw) provider = "ors";
    else notes.push("openrouteservice_unavailable");
  }
  if (!raw && config.osrmBaseUrl) {
    raw = await osrmMatrix(points, config.osrmBaseUrl, fetchFn, timeoutMs).catch(() => null);
    if (raw) provider = "osrm";
    else notes.push("osrm_unavailable");
  }
  if (!config.orsApiKey && !config.osrmBaseUrl) notes.push("road_routing_not_configured");

  const cells = points.map((from, i) => points.map((to, j) => {
    if (i === j) return { distanceKm: 0, durationMin: 0, source: provider ?? "straight_line" } as MatrixCell;
    const distanceKm = raw?.distanceKm[i]?.[j];
    const durationMin = raw?.durationMin[i]?.[j];
    if (provider && distanceKm != null && durationMin != null) return { distanceKm, durationMin, source: provider };
    return straightLineCell(from, to, speed);
  }));
  const offDiagonal = cells.flatMap((row, i) => row.filter((_, j) => i !== j));
  const roadCells = offDiagonal.filter((cell) => cell.source !== "straight_line").length;
  const estimateKind = offDiagonal.length === 0 || roadCells === offDiagonal.length ? (provider ? "road" : "straight_line")
    : roadCells === 0 ? "straight_line" : "mixed";
  if (estimateKind !== "road") notes.push(`straight_line_speed_assumption_${speed}_kmh`);
  const providers = [...new Set(offDiagonal.map((cell) => cell.source))];
  return { cells, estimateKind, providers: providers.length ? providers : [provider ?? "straight_line"], notes };
}

export type RouteGeometry = { type: "LineString"; coordinates: number[][] };
export type OrderedRoute = {
  legs: Array<{ distanceKm: number; durationMin: number }>;
  geometry: RouteGeometry | null;
  source: MatrixSource;
};

// Geometry for the chosen stop order (one request); straight lines when no road provider answers.
export async function routeThrough(points: LatLng[], config: RoutingConfig = {}): Promise<OrderedRoute> {
  const fetchFn = config.fetchFn ?? ((input, init) => fetch(input, init));
  const timeoutMs = config.timeoutMs ?? 8000;
  const speed = config.fallbackSpeedKmh ?? DEFAULT_FALLBACK_SPEED_KMH;
  if (points.length >= 2 && config.orsApiKey) {
    const response = await withTimeout(fetchFn, "https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: config.orsApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: points.map((p) => [p.longitude, p.latitude]) }),
    }, timeoutMs).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) as { features?: Array<{ geometry?: RouteGeometry; properties?: { segments?: Array<{ distance: number; duration: number }> } }> } | null : null;
    const feature = body?.features?.[0];
    const segments = feature?.properties?.segments;
    if (feature?.geometry?.type === "LineString" && Array.isArray(segments) && segments.length === points.length - 1) {
      return { legs: segments.map((s) => ({ distanceKm: s.distance / 1000, durationMin: s.duration / 60 })), geometry: feature.geometry, source: "ors" };
    }
  }
  if (points.length >= 2 && config.osrmBaseUrl) {
    const coordinates = points.map((p) => `${p.longitude.toFixed(6)},${p.latitude.toFixed(6)}`).join(";");
    const response = await withTimeout(fetchFn, `${config.osrmBaseUrl.replace(/\/$/, "")}/route/v1/driving/${coordinates}?overview=full&geometries=geojson`, {}, timeoutMs).catch(() => null);
    const body = response?.ok ? await response.json().catch(() => null) as { code?: string; routes?: Array<{ geometry?: RouteGeometry; legs?: Array<{ distance: number; duration: number }> }> } | null : null;
    const route = body?.code === "Ok" ? body.routes?.[0] : undefined;
    if (route?.geometry?.type === "LineString" && route.legs?.length === points.length - 1) {
      return { legs: route.legs.map((leg) => ({ distanceKm: leg.distance / 1000, durationMin: leg.duration / 60 })), geometry: route.geometry, source: "osrm" };
    }
  }
  return {
    legs: points.slice(1).map((to, index) => {
      const cell = straightLineCell(points[index], to, speed);
      return { distanceKm: cell.distanceKm, durationMin: cell.durationMin };
    }),
    geometry: points.length >= 2 ? { type: "LineString", coordinates: points.map((p) => [p.longitude, p.latitude]) } : null,
    source: "straight_line",
  };
}
