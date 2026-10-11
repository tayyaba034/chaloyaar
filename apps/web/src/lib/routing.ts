import "server-only";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "osrm" | "openrouteservice";
  geometry?: { type: "LineString"; coordinates: number[][] };
};

const REQUEST_TIMEOUT_MS = 8_000;

function isSummary(
  value: unknown,
): value is { distance: number; duration: number; geometry?: unknown } {
  if (!value || typeof value !== "object") return false;
  const summary = value as { distance?: unknown; duration?: unknown };
  return (
    typeof summary.distance === "number" &&
    Number.isFinite(summary.distance) &&
    typeof summary.duration === "number" &&
    Number.isFinite(summary.duration) &&
    summary.distance >= 0 &&
    summary.duration >= 0
  );
}

async function requestJson(
  url: string,
  init?: RequestInit,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Routing provider request failed", response.status);
      return null;
    }
    return (await response.json()) as unknown;
  } catch {
    console.error("Routing provider request failed or timed out");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOsrmRoute(
  origin: Coordinates,
  destination: Coordinates,
  via?: Coordinates,
): Promise<RouteEstimate | null> {
  const baseUrl = process.env.OSRM_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  const points = [origin, ...(via ? [via] : []), destination];
  const url = `${baseUrl}/route/v1/driving/${points.map((point) => `${point.longitude},${point.latitude}`).join(";")}?overview=full&geometries=geojson`;
  const payload = await requestJson(url);
  if (!payload || typeof payload !== "object") return null;
  const route = (
    payload as {
      routes?: Array<{
        distance?: unknown;
        duration?: unknown;
        geometry?: unknown;
      }>;
    }
  ).routes?.[0];
  if (!route || !isSummary(route)) {
    console.error("OSRM returned no usable route summary");
    return null;
  }
  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    source: "osrm",
    ...(validGeometry(route.geometry) ? { geometry: route.geometry } : {}),
  };
}

async function getOpenRouteServiceRoute(
  origin: Coordinates,
  destination: Coordinates,
  via?: Coordinates,
): Promise<RouteEstimate | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) return null;
  const payload = await requestJson(
    "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [origin, ...(via ? [via] : []), destination].map(
          (point) => [point.longitude, point.latitude],
        ),
        instructions: false,
      }),
    },
  );
  if (!payload || typeof payload !== "object") return null;
  const feature = (
    payload as {
      features?: Array<{
        geometry?: unknown;
        properties?: { summary?: unknown };
      }>;
      routes?: Array<{ summary?: unknown }>;
    }
  ).features?.[0];
  const summary =
    feature?.properties?.summary ??
    (payload as { routes?: Array<{ summary?: unknown }> }).routes?.[0]?.summary;
  if (!isSummary(summary)) {
    console.error("OpenRouteService returned no usable route summary");
    return null;
  }
  return {
    distanceKm: summary.distance / 1000,
    durationMinutes: summary.duration / 60,
    source: "openrouteservice",
    ...(validGeometry(feature?.geometry) ? { geometry: feature.geometry } : {}),
  };
}

export async function getDrivingRoute(
  origin: Coordinates,
  destination: Coordinates,
  via?: Coordinates,
  provider?: RouteEstimate["source"],
): Promise<RouteEstimate | null> {
  if (provider === "osrm") return getOsrmRoute(origin, destination, via);
  if (provider === "openrouteservice") return getOpenRouteServiceRoute(origin, destination, via);
  return (
    (await getOsrmRoute(origin, destination, via)) ??
    (await getOpenRouteServiceRoute(origin, destination, via))
  );
}

function validGeometry(
  value: unknown,
): value is { type: "LineString"; coordinates: number[][] } {
  if (!value || typeof value !== "object") return false;
  const line = value as { type?: unknown; coordinates?: unknown };
  return (
    line.type === "LineString" &&
    Array.isArray(line.coordinates) &&
    line.coordinates.length >= 2 &&
    line.coordinates.every(
      (point) =>
        Array.isArray(point) &&
          point.length >= 2 &&
          Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90 &&
        point.every(
          (number) => typeof number === "number" && Number.isFinite(number),
        ),
    )
  );
}
