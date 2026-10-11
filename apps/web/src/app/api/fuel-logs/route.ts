import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { calculateMileage, isUuid, numberInput } from "@/lib/driver-records";

const MAX_LITRES = 500;
const MAX_AMOUNT = 1_000_000;
const MAX_ODOMETER = 2_000_000;

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("fuel_logs")
    .select(
      "id,litres,total_amount,odometer_km,logged_at,station_id,vehicle_id,is_demo,stations(name)",
    )
    .eq("user_id", access.profile.id)
    .order("logged_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("Fuel logs query failed", error.message);
    return errorResponse(
      "FUEL_LOGS_UNAVAILABLE",
      "Fuel logs are temporarily unavailable.",
      503,
    );
  }

  const logs = data ?? [];
  const totalLitres = logs.reduce((sum, log) => sum + Number(log.litres), 0);
  const totalSpend = logs.reduce(
    (sum, log) => sum + Number(log.total_amount),
    0,
  );

  return NextResponse.json(
    {
      logs,
      summary: {
        totalLitres,
        totalSpend,
        kmPerLitre: calculateMileage(
          logs.map((log) => ({
            ...log,
            litres: Number(log.litres),
            odometer_km:
              log.odometer_km === null ? null : Number(log.odometer_km),
          })),
        ),
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
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
  const litres = numberInput(payload.litres);
  const totalAmount = numberInput(payload.totalAmount);
  const odometer =
    payload.odometer === "" ||
    payload.odometer === null ||
    payload.odometer === undefined
      ? null
      : numberInput(payload.odometer);
  const loggedAt = payload.loggedAt
    ? new Date(String(payload.loggedAt))
    : new Date();

  if (litres === null || litres <= 0 || litres > MAX_LITRES) {
    return errorResponse(
      "VALIDATION_ERROR",
      "Fuel quantity must be between 0 and 500 litres.",
    );
  }
  if (totalAmount === null || totalAmount < 0 || totalAmount > MAX_AMOUNT) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid total amount.");
  }
  if (
    odometer !== null &&
    (!Number.isFinite(odometer) || odometer < 0 || odometer > MAX_ODOMETER)
  ) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid odometer reading.");
  }
  if (payload.odometer != null && payload.odometer !== "" && odometer === null)
    return errorResponse("VALIDATION_ERROR", "Enter a valid odometer reading.");
  if (Number.isNaN(loggedAt.getTime()) || loggedAt.getTime() > Date.now()) {
    return errorResponse(
      "VALIDATION_ERROR",
      "The refuel date cannot be in the future.",
    );
  }

  const vehicleId = payload.vehicleId || null;
  if (vehicleId) {
    if (!isUuid(vehicleId))
      return errorResponse("VALIDATION_ERROR", "Choose a valid vehicle.");
    const vehicle = await access.supabase
      .from("driver_vehicles")
      .select("id")
      .eq("id", vehicleId)
      .eq("user_id", access.profile.id)
      .maybeSingle();
    if (vehicle.error || !vehicle.data)
      return errorResponse(
        "VALIDATION_ERROR",
        "Choose one of your own saved vehicles.",
      );
  }
  if (odometer !== null && vehicleId) {
    const base = () =>
      access.supabase
        .from("fuel_logs")
        .select("odometer_km")
        .eq("user_id", access.profile.id)
        .eq("vehicle_id", vehicleId)
        .not("odometer_km", "is", null);
    const [before, after] = await Promise.all([
      base()
        .lte("logged_at", loggedAt.toISOString())
        .order("logged_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      base()
        .gt("logged_at", loggedAt.toISOString())
        .order("logged_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (before.error || after.error) {
      return errorResponse(
        "FUEL_LOG_FAILED",
        "The fuel log could not be saved.",
        503,
      );
    }
    if (
      (before.data && odometer < Number(before.data.odometer_km)) ||
      (after.data && odometer > Number(after.data.odometer_km))
    ) {
      return errorResponse(
        "VALIDATION_ERROR",
        "The odometer must fit this vehicle's earlier and later readings.",
      );
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
      return errorResponse(
        "FUEL_LOG_FAILED",
        "The fuel log could not be saved.",
        503,
      );
    }
    if (!station)
      return errorResponse("VALIDATION_ERROR", "Choose a valid station.");
    stationId = payload.stationId;
  }

  const { data, error } = await access.supabase
    .from("fuel_logs")
    .insert({
      user_id: access.profile.id,
      station_id: stationId,
      vehicle_id: vehicleId,
      litres,
      total_amount: totalAmount,
      odometer_km: odometer,
      logged_at: loggedAt.toISOString(),
      is_demo: false,
    })
    .select(
      "id,litres,total_amount,odometer_km,logged_at,station_id,vehicle_id,is_demo,stations(name)",
    )
    .single();
  if (error) {
    console.error("Fuel log creation failed", error.message);
    return errorResponse(
      "FUEL_LOG_FAILED",
      "The fuel log could not be saved.",
      503,
    );
  }
  return NextResponse.json(
    { log: data },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
