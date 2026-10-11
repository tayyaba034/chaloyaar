import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getLatestOgraFuelPrices } from "@/lib/ogra-prices";
import { demoStations, getStationLiveFacts, getStations, type FuelType } from "@/lib/stations";

const knownAreas = {
  "city-centre": { latitude: 31.4181, longitude: 73.0791 },
  "susan-road": { latitude: 31.4077, longitude: 73.0912 },
  "d-ground": { latitude: 31.4093, longitude: 73.112 },
} as const;

function distanceKm(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(first.latitude);
  const lat2 = radians(second.latitude);
  const dLat = lat2 - lat1;
  const dLon = radians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: randomUUID() } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const areaId = searchParams.get("areaId");
  const latitudeText = searchParams.get("lat");
  const longitudeText = searchParams.get("lng");
  const requestedFuelType = searchParams.get("fuelType");
  const radiusKm = Number(searchParams.get("radiusKm") ?? "15");

  if (
    requestedFuelType &&
    requestedFuelType !== "petrol" &&
    requestedFuelType !== "diesel" &&
    requestedFuelType !== "cng"
  ) {
    return errorResponse("VALIDATION_ERROR", "Choose a valid fuel type.", 400);
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 1 || radiusKm > 30) {
    return errorResponse("VALIDATION_ERROR", "Radius must be between 1 and 30 km.", 400);
  }

  let origin: { latitude: number; longitude: number };
  if (latitudeText !== null && longitudeText !== null) {
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return errorResponse("VALIDATION_ERROR", "Choose a valid map location.", 400);
    }
    origin = { latitude, longitude };
  } else if (areaId && areaId in knownAreas) {
    origin = knownAreas[areaId as keyof typeof knownAreas];
  } else {
    return errorResponse("LOCATION_REQUIRED", "Choose an area or allow location access.", 400);
  }

  try {
    let stations = await getStations();
    let degraded = false;
    let degradedMessage: string | null = null;
    if (stations.length === 0) {
      stations = demoStations;
      degraded = true;
      degradedMessage = "Live station data is unavailable; showing clearly labelled demo locations.";
    }
    const liveFacts = await getStationLiveFacts(stations.map((station) => station.id));
    if (!liveFacts.prices.petrol || !liveFacts.prices.diesel) {
      try {
        const ogra = await getLatestOgraFuelPrices();
        liveFacts.prices.petrol ??= ogra.petrol;
        liveFacts.prices.diesel ??= ogra.diesel;
      } catch (priceError) {
        console.error("OGRA fuel price refresh failed", priceError);
      }
    }
    const selectedFuel: FuelType = requestedFuelType
      ? (requestedFuelType as FuelType)
      : "petrol";
    const results = stations
      .filter((station) => !station.isDemo)
      .map((station) => ({
        ...station,
        distanceKm: distanceKm(origin, station),
        distanceKind: "straight_line_approximate" as const,
        availability: liveFacts.availability[station.id]?.[selectedFuel]
          ? {
              ...liveFacts.availability[station.id][selectedFuel],
            }
          : { state: "unknown" as const, source: null, reportedAt: null },
        officialPrice: {
          amount: liveFacts.prices[selectedFuel]?.amount ?? null,
          currency: "PKR" as const,
          source: liveFacts.prices[selectedFuel]?.source ?? null,
          effectiveAt: liveFacts.prices[selectedFuel]?.effectiveAt ?? null,
        },
      }))
      .filter(
        (station) =>
          station.distanceKm <= radiusKm &&
          (!requestedFuelType ||
            station.supportedFuels.length === 0 ||
            station.supportedFuels.includes(selectedFuel)),
      )
      .sort((left, right) => left.distanceKm - right.distanceKm)
      .slice(0, 50);

    return NextResponse.json(
      { stations: results, degraded, degradedMessage },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (error) {
    console.error("Nearby station query failed", error);
    return NextResponse.json(
      {
        stations: demoStations
          .map((station) => ({
            ...station,
            distanceKm: distanceKm(origin, station),
            distanceKind: "straight_line_approximate" as const,
            availability: { state: "unknown" as const, source: null, reportedAt: null },
            officialPrice: { amount: null, currency: "PKR" as const, source: null, effectiveAt: null },
          }))
          .filter((station) => station.distanceKm <= radiusKm),
        degraded: true,
        degradedMessage: "Live station data is unavailable; showing clearly labelled demo locations.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
