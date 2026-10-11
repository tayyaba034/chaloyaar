import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const fuels = new Set(["petrol", "diesel", "cng"]);
const statuses = new Set(["available", "unavailable", "queue_reported"]);

export async function POST(request: NextRequest) {
  const access = await requireApiRole("station_admin");
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("stationId" in body) ||
    !("fuelType" in body) ||
    !("status" in body) ||
    typeof body.stationId !== "string" ||
    typeof body.fuelType !== "string" ||
    typeof body.status !== "string" ||
    !fuels.has(body.fuelType) ||
    !statuses.has(body.status)
  ) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Choose a station, fuel and availability status." } },
      { status: 400 },
    );
  }

  const { error } = await access.supabase.rpc("set_station_availability", {
    target_station_id: body.stationId,
    target_fuel_type: body.fuelType,
    target_status: body.status,
  });
  if (error) {
    console.error("Station availability update failed", error.message);
    return NextResponse.json(
      { error: { code: "AVAILABILITY_UPDATE_FAILED", message: "Availability could not be updated." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
