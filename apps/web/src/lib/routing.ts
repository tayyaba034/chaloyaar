import "server-only";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "osrm" | "openrouteservice";
};

const REQUEST_TIMEOUT_MS = 8_000;

function isSummary(value: unknown): value is { distance: number; duration: number } {
  if (!value || typeof value !== "object") return false;
  const summary = value as { distance?: unknown; duration?: unknown };
  return typeof summary.distance === "number"
    && Number.isFinite(summary.distance)
    && typeof summary.duration === "number"
    && Number.isFinite(summary.duration)
    && summary.distance >= 0
    && summary.duration >= 0;
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      console.error("Routing provider request failed", response.status);
      return null;
    }
    return await response.json() as unknown;
  } catch (error) {
    console.error("Routing provider request failed", error instanceof Error ? error.message : "unknown error");
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOsrmRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<RouteEstimate | null> {
  const baseUrl = (process.env.OSRM_BASE_URL ?? "https://router.project-osrm.org").replace(/\/+$/, "");
  const url = `${baseUrl}/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=false`;
  const payload = await requestJson(url);
  if (!payload || typeof payload !== "object") return null;
  const route = (payload as { routes?: Array<{ distance?: unknown; duration?: unknown }> }).routes?.[0];
  if (!route || !isSummary(route)) {
    console.error("OSRM returned no usable route summary");
    return null;
  }
  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    source: "osrm",
  };
}

async function getOpenRouteServiceRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<RouteEstimate | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY?.trim();
  if (!apiKey) return null;
  const payload = await requestJson(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        coordinates: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude],
        ],
        instructions: false,
      }),
    },
  );
  if (!payload || typeof payload !== "object") return null;
  const summary = (payload as {
    routes?: Array<{ summary?: { distance?: unknown; duration?: unknown } }>
  }).routes?.[0]?.summary;
  if (!isSummary(summary)) {
    console.error("OpenRouteService returned no usable route summary");
    return null;
  }
  return {
    distanceKm: summary.distance / 1000,
    durationMinutes: summary.duration / 60,
    source: "openrouteservice",
  };
}

export async function getDrivingRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<RouteEstimate | null> {
  return await getOsrmRoute(origin, destination)
    ?? await getOpenRouteServiceRoute(origin, destination);
}
