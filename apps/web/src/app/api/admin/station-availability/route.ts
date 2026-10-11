import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const serviceTypes = new Set(["petrol", "diesel", "cng", "tyre_repair", "battery_help", "towing", "portable_diesel_delivery"]);
const statuses = new Set(["available", "unavailable"]);

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const [stationsResult, availabilityResult] = await Promise.all([
    access.supabase
      .from("station_public")
      .select("id,name,address,supported_fuels,latitude,longitude,is_demo")
      .order("name")
      .limit(200),
    access.supabase
      .from("station_service_availability")
      .select("station_id,service_type,status,updated_at"),
  ]);
  const failed = [stationsResult, availabilityResult].find((result) => result.error);
  if (failed?.error) {
    console.error("Admin station availability query failed", failed.error.message);
    return errorResponse("AVAILABILITY_UNAVAILABLE", "Station availability is temporarily unavailable.", 503);
  }
  return NextResponse.json({
    stations: stationsResult.data ?? [],
    services: availabilityResult.data ?? [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Send valid JSON.");
  }
  if (!body || typeof body !== "object") return errorResponse("VALIDATION_ERROR", "Choose a station, service and status.");
  const payload = body as Record<string, unknown>;
  const stationId = typeof payload.stationId === "string" ? payload.stationId : "";
  const serviceType = typeof payload.serviceType === "string" ? payload.serviceType : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  if (!stationId || !serviceTypes.has(serviceType) || !statuses.has(status)) {
    return errorResponse("VALIDATION_ERROR", "Choose a valid station, service and status.");
  }
  const { data, error } = await access.supabase
    .from("station_service_availability")
    .upsert({
      station_id: stationId,
      service_type: serviceType,
      status,
      updated_by: access.profile.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "station_id,service_type" })
    .select("station_id,service_type,status,updated_at")
    .single();
  if (error) {
    console.error("Admin station availability update failed", error.message);
    return errorResponse("AVAILABILITY_UPDATE_FAILED", "Station availability could not be updated.", 503);
  }
  return NextResponse.json({ service: data }, { headers: { "Cache-Control": "no-store" } });
}
