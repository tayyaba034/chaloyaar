import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const fuels = new Set(["petrol", "diesel", "cng"]);
const statuses = new Set(["available", "unavailable", "queue_reported"]);

export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose a station, fuel and status." } }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  if (
    typeof payload.stationId !== "string" ||
    typeof payload.fuelType !== "string" ||
    !fuels.has(payload.fuelType) ||
    typeof payload.status !== "string" ||
    !statuses.has(payload.status)
  ) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Choose a station, fuel and status." } }, { status: 400 });
  }

  const { data: station, error: stationError } = await access.supabase
    .from("stations")
    .select("id,supported_fuels")
    .eq("id", payload.stationId)
    .maybeSingle();
  if (stationError) {
    console.error("Station report station lookup failed", stationError.message);
    return NextResponse.json({ error: { code: "REPORT_FAILED", message: "The report could not be submitted." } }, { status: 503 });
  }
  if (!station || !Array.isArray(station.supported_fuels) || !station.supported_fuels.includes(payload.fuelType)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "That fuel is not listed for this station." } }, { status: 400 });
  }

  const { data, error } = await access.supabase
    .from("availability_reports")
    .insert({
      station_id: payload.stationId,
      fuel_type: payload.fuelType,
      reported_status: payload.status,
      source_type: "user",
      reporter_id: access.profile.id,
      moderation_status: "pending",
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      is_demo: false,
    })
    .select("id,station_id,fuel_type,reported_status,moderation_status,reported_at,expires_at")
    .single();
  if (error) {
    console.error("Station availability report creation failed", error.message);
    return NextResponse.json({ error: { code: "REPORT_FAILED", message: "The report could not be submitted." } }, { status: 503 });
  }
  return NextResponse.json({ report: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
