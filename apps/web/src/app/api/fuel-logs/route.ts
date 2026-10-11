import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const MAX_LITRES = 500;
const MAX_AMOUNT = 1_000_000;
const MAX_ODOMETER = 2_000_000;

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("fuel_logs")
    .select("id,litres,total_amount,odometer_km,logged_at,station_id,stations(name)")
    .eq("user_id", access.profile.id)
    .order("logged_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("Fuel logs query failed", error.message);
    return errorResponse("FUEL_LOGS_UNAVAILABLE", "Fuel logs are temporarily unavailable.", 503);
  }

  const logs = data ?? [];
  const validOdometers = logs
    .filter((log) => log.odometer_km !== null)
    .map((log) => Number(log.odometer_km))
    .filter(Number.isFinite);
  const totalLitres = logs.reduce((sum, log) => sum + Number(log.litres), 0);
  const totalSpend = logs.reduce((sum, log) => sum + Number(log.total_amount), 0);
  const newestOdometer = validOdometers[0];
  const oldestOdometer = validOdometers.at(-1);
  const drivenKm = newestOdometer !== undefined && oldestOdometer !== undefined
    ? newestOdometer - oldestOdometer
    : 0;

  return NextResponse.json({
    logs,
    summary: {
      totalLitres,
      totalSpend,
      kmPerLitre: drivenKm > 0 && totalLitres > 0 ? drivenKm / totalLitres : null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Send valid JSON.");
  }
  if (!body || typeof body !== "object") {
    return errorResponse("VALIDATION_ERROR", "Enter the fuel details.");
  }

  const payload = body as Record<string, unknown>;
  const litres = typeof payload.litres === "number" ? payload.litres : Number(payload.litres);
  const totalAmount = typeof payload.totalAmount === "number"
    ? payload.totalAmount
    : Number(payload.totalAmount);
  const odometer = payload.odometer === "" || payload.odometer === null || payload.odometer === undefined
    ? null
    : typeof payload.odometer === "number" ? payload.odometer : Number(payload.odometer);
  const loggedAt = payload.loggedAt ? new Date(String(payload.loggedAt)) : new Date();

  if (!Number.isFinite(litres) || litres <= 0 || litres > MAX_LITRES) {
    return errorResponse("VALIDATION_ERROR", "Fuel quantity must be between 0 and 500 litres.");
  }
  if (!Number.isFinite(totalAmount) || totalAmount < 0 || totalAmount > MAX_AMOUNT) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid total amount.");
  }
  if (odometer !== null && (!Number.isFinite(odometer) || odometer < 0 || odometer > MAX_ODOMETER)) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid odometer reading.");
  }
  if (Number.isNaN(loggedAt.getTime()) || loggedAt.getTime() > Date.now()) {
    return errorResponse("VALIDATION_ERROR", "The refuel date cannot be in the future.");
  }

  if (odometer !== null) {
    const { data: latest, error: latestError } = await access.supabase
      .from("fuel_logs")
      .select("odometer_km")
      .eq("user_id", access.profile.id)
      .not("odometer_km", "is", null)
      .order("logged_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) {
      console.error("Latest odometer lookup failed", latestError.message);
      return errorResponse("FUEL_LOG_FAILED", "The fuel log could not be saved.", 503);
    }
    if (latest && odometer < Number(latest.odometer_km)) {
      return errorResponse("VALIDATION_ERROR", "The odometer reading cannot go backwards.");
    }
  }

  let stationId: string | null = null;
  if (payload.stationId) {
    if (typeof payload.stationId !== "string") {
      return errorResponse("VALIDATION_ERROR", "Choose a valid station.");
    }
    const { data: station, error: stationError } = await access.supabase
      .from("stations")
      .select("id")
      .eq("id", payload.stationId)
      .maybeSingle();
    if (stationError) {
      console.error("Fuel log station lookup failed", stationError.message);
      return errorResponse("FUEL_LOG_FAILED", "The fuel log could not be saved.", 503);
    }
    if (!station) return errorResponse("VALIDATION_ERROR", "Choose a valid station.");
    stationId = payload.stationId;
  }

  const { data, error } = await access.supabase
    .from("fuel_logs")
    .insert({
      user_id: access.profile.id,
      station_id: stationId,
      litres,
      total_amount: totalAmount,
      odometer_km: odometer,
      logged_at: loggedAt.toISOString(),
      is_demo: false,
    })
    .select("id,litres,total_amount,odometer_km,logged_at,station_id,stations(name)")
    .single();
  if (error) {
    console.error("Fuel log creation failed", error.message);
    return errorResponse("FUEL_LOG_FAILED", "The fuel log could not be saved.", 503);
  }
  return NextResponse.json({ log: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
