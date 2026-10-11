import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { calculateEstimate, distanceKm, type Point } from "@/lib/truecost";
import { getDrivingRoute } from "@/lib/routing";
import { isUuid, numberInput } from "@/lib/driver-records";
import { getStationLiveFacts } from "@/lib/stations";

function point(payload: Record<string, unknown>, prefix: string): Point | null {
  const latitude = numberInput(payload[`${prefix}Latitude`]),
    longitude = numberInput(payload[`${prefix}Longitude`]);
  return latitude !== null &&
    longitude !== null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const reply = (body: unknown, status = 200) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  const error = (message: string, status = 400) =>
    reply({ error: { message } }, status);
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object")
    return error("Enter route and fuel details.");
  const origin = point(payload, "origin"),
    destination = point(payload, "destination"),
    litres = numberInput(payload.litres);
  if (
    !origin ||
    !destination ||
    litres === null ||
    litres <= 0 ||
    litres > 500 ||
    !["petrol", "diesel", "cng"].includes(payload.fuelType)
  )
    return error(
      "Enter valid coordinates, fuel type and quantity (up to 500 litres).",
    );
  let economy =
    payload.kmPerLitre == null || payload.kmPerLitre === ""
      ? null
      : numberInput(payload.kmPerLitre);
  if (
    payload.kmPerLitre != null &&
    payload.kmPerLitre !== "" &&
    economy === null
  )
    return error("Enter a valid fuel economy.");
  if (payload.vehicleId) {
    if (!isUuid(payload.vehicleId))
      return error("Choose a valid saved vehicle.");
    const vehicle = await access.supabase
      .from("driver_vehicles")
      .select("estimated_km_per_litre,fuel_type")
      .eq("id", payload.vehicleId)
      .eq("user_id", access.profile.id)
      .maybeSingle();
    if (vehicle.error || !vehicle.data)
      return error("Choose one of your own vehicles.");
    if (vehicle.data.fuel_type !== payload.fuelType)
      return error("The selected fuel must match your vehicle.");
    economy =
      vehicle.data.estimated_km_per_litre === null
        ? economy
        : Number(vehicle.data.estimated_km_per_litre);
  }
  if (economy !== null && (economy <= 0 || economy > 200))
    return error("Fuel economy must be between 0 and 200 km/L.");
  if (
    !payload.vehicleId &&
    payload.kmPerLitre != null &&
    payload.kmPerLitre !== "" &&
    economy === null
  )
    return error("Enter a valid fuel economy.");
  const [stationsResult, priceResult] = await Promise.all([
    access.supabase
      .from("station_public")
      .select("id,name,address,latitude,longitude,supported_fuels,is_demo")
      .limit(100),
    access.supabase
      .from("fuel_prices")
      .select("price_per_litre,source_name,effective_at,is_demo")
      .eq("fuel_type", payload.fuelType)
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (stationsResult.error || priceResult.error)
    return error("Route comparison data is unavailable.", 503);
  if (!priceResult.data)
    return error(
      "No sourced fuel price is available. You can use the clearly labelled personal-figures calculator instead.",
      422,
    );
  const price = priceResult.data;
  const candidates = (stationsResult.data ?? [])
    .filter((station) => station.supported_fuels?.includes(payload.fuelType))
    .map((station) => ({
      ...station,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
    }))
    .filter(
      (station) =>
        Number.isFinite(station.latitude) &&
        Number.isFinite(station.longitude) &&
        distanceKm(origin, station) <= 15,
    )
    .sort((a, b) => distanceKm(origin, a) - distanceKm(origin, b))
    .slice(0, 6);
  const [direct, facts] = await Promise.all([
    getDrivingRoute(origin, destination),
    getStationLiveFacts(candidates.map((station) => station.id)),
  ]);
  const stations = await Promise.all(
    candidates.map(async (station) => {
      const via = direct
        ? await getDrivingRoute(origin, destination, station)
        : null;
      const road = Boolean(direct && via && direct.source === via.source);
      const directDistanceKm = road
        ? direct!.distanceKm
        : distanceKm(origin, destination);
      const viaStationDistanceKm = road
        ? via!.distanceKm
        : distanceKm(origin, station) + distanceKm(station, destination);
      return {
        ...station,
        isDemo: station.is_demo,
        availability:
          facts.availability[station.id]?.[
            payload.fuelType as "petrol" | "diesel" | "cng"
          ]?.state ?? "unknown",
        directDistanceKm,
        viaStationDistanceKm,
        routing: road ? via!.source : "approximate",
        geometry: road ? (via!.geometry ?? null) : null,
        discount: 0,
        ...calculateEstimate({
          directDistanceKm,
          viaStationDistanceKm,
          litres,
          pricePerLitre: Number(price.price_per_litre),
          kmPerLitre: economy,
        }),
      };
    }),
  );
  stations.sort(
    (a, b) =>
      (a.totalCost ?? a.viaStationDistanceKm) -
      (b.totalCost ?? b.viaStationDistanceKm),
  );
  return reply({
    fuelType: payload.fuelType,
    litres,
    kmPerLitre: economy,
    directDistanceKm: direct?.distanceKm ?? distanceKm(origin, destination),
    routing: direct?.source ?? "approximate",
    routeDurationMinutes: direct?.durationMinutes ?? null,
    routeGeometry: direct?.geometry ?? null,
    price: {
      amount: Number(price.price_per_litre),
      source: price.source_name,
      effectiveAt: price.effective_at,
      isDemo: price.is_demo,
    },
    stations,
    assumptions: [
      "Candidates are within 15 km (straight line) of the chosen origin; this is not exhaustive route coverage.",
      "Road detours use a direct and via-station route from the same provider. Failed routes use consistently labelled straight-line estimates with no ETA.",
      "Fuel economy uses your saved vehicle estimate or your entered km/L. This is not measured driving performance.",
      "Total = purchase + detour fuel cost - eligible discount. Discount is zero because no verified redeemable offers are configured.",
    ],
  });
}
