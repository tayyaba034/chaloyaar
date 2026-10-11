import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { getDrivingRoute } from "@/lib/routing";
import { isUuid, numberInput } from "@/lib/driver-records";
import { getStationsAlongRoute } from "@/lib/stations";
import { compareRoute } from "@/lib/route-comparison";
import type { Point } from "@/lib/truecost";

function point(payload: Record<string, unknown>, prefix: string): Point | null {
  const latitude = numberInput(payload[`${prefix}Latitude`]), longitude = numberInput(payload[`${prefix}Longitude`]);
  return latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response!;
  const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const error = (message: string, status = 400) => reply({ error: { message } }, status);
  const raw: unknown = await request.json().catch(() => null);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return error("Enter route and fuel details.");
  const payload = raw as Record<string, unknown>;
  const origin = point(payload, "origin"), destination = point(payload, "destination"), litres = numberInput(payload.litres);
  const fuelType = payload.fuelType;
  if (!origin || !destination || litres === null || litres <= 0 || litres > 500 || (fuelType !== "petrol" && fuelType !== "diesel")) {
    return error("Enter valid locations and petrol/diesel quantity (up to 500 litres). CNG units are not supported for this estimate.");
  }
  let economy = payload.kmPerLitre == null || payload.kmPerLitre === "" ? null : numberInput(payload.kmPerLitre);
  if (payload.kmPerLitre != null && payload.kmPerLitre !== "" && economy === null) return error("Enter a valid fuel economy.");
  if (payload.vehicleId) {
    if (!isUuid(payload.vehicleId)) return error("Choose a valid saved vehicle.");
    const vehicle = await access.supabase.from("driver_vehicles").select("estimated_km_per_litre,fuel_type")
      .eq("id", payload.vehicleId).eq("user_id", access.profile.id).maybeSingle();
    if (vehicle.error || !vehicle.data) return error("Choose one of your own vehicles.");
    if (vehicle.data.fuel_type !== fuelType) return error("The selected fuel must match your vehicle.");
    if (vehicle.data.estimated_km_per_litre !== null) economy = Number(vehicle.data.estimated_km_per_litre);
  }
  if (economy !== null && (economy <= 0 || economy > 200)) return error("Fuel economy must be above zero and at most 200 km/L.");
  try {
    const comparison = await compareRoute({ origin, destination, litres, kmPerLitre: economy, fuelType }, {
      route: getDrivingRoute,
      candidates: (geometry, fuel) => getStationsAlongRoute(access.supabase, geometry, fuel),
      offers: [], // No verified offer/redemption integration exists. Never accept client discounts.
    });
    return reply({ ...comparison, fuelType, litres, kmPerLitre: economy, calculatedAt: new Date().toISOString() });
  } catch (failure) {
    console.error("Route comparison failed", failure instanceof Error ? failure.name : "Unknown failure");
    return error("Route comparison data is temporarily unavailable. Please retry.", 503);
  }
}
