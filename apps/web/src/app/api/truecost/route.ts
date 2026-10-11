import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { calculateEstimate, distanceKm, type Point } from "@/lib/truecost";

const fuelTypes = new Set(["petrol", "diesel", "cng"]);

function responseError(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function point(payload: Record<string, unknown>, prefix: string): Point | null {
  const latitude = Number(payload[`${prefix}Latitude`]);
  const longitude = Number(payload[`${prefix}Longitude`]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseError("INVALID_JSON", "Send valid JSON.");
  }
  if (!body || typeof body !== "object") return responseError("VALIDATION_ERROR", "Enter route and fuel details.");
  const payload = body as Record<string, unknown>;
  const origin = point(payload, "origin");
  const destination = point(payload, "destination");
  const fuelType = typeof payload.fuelType === "string" ? payload.fuelType : "";
  const litres = Number(payload.litres);
  if (!origin || !destination) return responseError("VALIDATION_ERROR", "Enter valid origin and destination coordinates.");
  if (!fuelTypes.has(fuelType)) return responseError("VALIDATION_ERROR", "Choose a supported fuel type.");
  if (!Number.isFinite(litres) || litres <= 0 || litres > 500) return responseError("VALIDATION_ERROR", "Fuel quantity must be between 0 and 500 litres.");

  const [stationsResult, priceResult, logsResult] = await Promise.all([
    access.supabase
      .from("station_public")
      .select("id,name,address,latitude,longitude,supported_fuels,is_demo")
      .limit(100),
    access.supabase
      .from("fuel_prices")
      .select("price_per_litre,source_name,effective_at,is_demo")
      .eq("fuel_type", fuelType)
      .lte("effective_at", new Date().toISOString())
      .order("effective_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    access.supabase
      .from("fuel_logs")
      .select("litres,odometer_km,logged_at")
      .eq("user_id", access.profile.id)
      .not("odometer_km", "is", null)
      .order("logged_at", { ascending: true })
      .limit(200),
  ]);
  const failed = [stationsResult, priceResult, logsResult].find((result) => result.error);
  if (failed?.error) {
    console.error("TrueCost data query failed", failed.error.message);
    return responseError("TRUECOST_UNAVAILABLE", "The estimate is temporarily unavailable.", 503);
  }
  const price = priceResult.data;
  if (!price) return responseError("PRICE_UNAVAILABLE", "No official fuel price is available for this fuel type.", 422);

  const logs = logsResult.data ?? [];
  const first = logs[0]?.odometer_km;
  const last = logs.at(-1)?.odometer_km;
  const totalLitres = logs.reduce((sum, log) => sum + Number(log.litres), 0);
  const kmPerLitre = first !== undefined && last !== undefined && Number(last) > Number(first) && totalLitres > 0
    ? (Number(last) - Number(first)) / totalLitres
    : null;
  const directDistanceKm = distanceKm(origin, destination);
  const stations = (stationsResult.data ?? [])
    .filter((station) => Array.isArray(station.supported_fuels) && station.supported_fuels.includes(fuelType))
    .map((station) => {
      const stationPoint = { latitude: Number(station.latitude), longitude: Number(station.longitude) };
      const viaStationDistanceKm = distanceKm(origin, stationPoint) + distanceKm(stationPoint, destination);
      const estimate = calculateEstimate({
        directDistanceKm,
        viaStationDistanceKm,
        litres,
        pricePerLitre: Number(price.price_per_litre),
        kmPerLitre,
      });
      return {
        id: station.id,
        name: station.name,
        address: station.address,
        isDemo: station.is_demo,
        directDistanceKm,
        viaStationDistanceKm,
        ...estimate,
      };
    })
    .filter((station) => Number.isFinite(station.viaStationDistanceKm))
    .sort((firstStation, secondStation) => {
      if (firstStation.totalCost !== null && secondStation.totalCost !== null) return firstStation.totalCost - secondStation.totalCost;
      return firstStation.viaStationDistanceKm - secondStation.viaStationDistanceKm;
    })
    .slice(0, 10);

  return NextResponse.json({
    fuelType,
    litres,
    directDistanceKm,
    kmPerLitre,
    price: {
      amount: Number(price.price_per_litre),
      source: price.source_name,
      effectiveAt: price.effective_at,
      isDemo: price.is_demo,
    },
    routing: "approximate",
    stations,
    assumptions: [
      "Distances use straight-line approximation; no ETA is provided.",
      kmPerLitre === null ? "Total detour cost is unavailable until you have valid fuel and odometer history." : "Detour fuel cost uses your recorded average efficiency.",
      "No discount has been applied because no verified redeemable offer is configured.",
    ],
  }, { headers: { "Cache-Control": "private, no-store" } });
}
