import "server-only";

export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  source: "openrouteservice";
};

export async function getDrivingRoute(
  origin: Coordinates,
  destination: Coordinates,
): Promise<RouteEstimate | null> {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [origin.longitude, origin.latitude],
          [destination.longitude, destination.latitude],
        ],
        instructions: false,
      }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    console.error("OpenRouteService route request failed", response.status);
    return null;
  }

  const payload = (await response.json()) as {
    routes?: Array<{ summary?: { distance?: number; duration?: number } }>;
  };
  const summary = payload.routes?.[0]?.summary;
  if (
    !summary ||
    typeof summary.distance !== "number" ||
    typeof summary.duration !== "number"
  ) {
    console.error("OpenRouteService returned no usable route summary");
    return null;
  }

  return {
    distanceKm: summary.distance / 1000,
    durationMinutes: summary.duration / 60,
    source: "openrouteservice",
  };
}
