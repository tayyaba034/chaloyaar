import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const serviceTypes = new Set(["puncture", "battery", "towing"]);

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("service_requests")
    .select("id,service_type,status,latitude,longitude,notes,created_at,updated_at,is_demo")
    .eq("user_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Driver requests query failed", error.message);
    return errorResponse("REQUESTS_QUERY_FAILED", "Requests are temporarily unavailable.", 503);
  }
  return NextResponse.json(
    { requests: data ?? [] },
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
    return errorResponse("INVALID_JSON", "Send valid JSON.", 400);
  }

  if (!body || typeof body !== "object") {
    return errorResponse("VALIDATION_ERROR", "Choose a service and share your location.", 400);
  }
  const payload = body as Record<string, unknown>;
  const serviceType = payload.serviceType;
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const notes = payload.notes;

  if (
    typeof serviceType !== "string" ||
    !serviceTypes.has(serviceType) ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    (notes !== undefined && notes !== null && (typeof notes !== "string" || notes.length > 500))
  ) {
    return errorResponse("VALIDATION_ERROR", "Choose a service and share a valid location.", 400);
  }

  const { data, error } = await access.supabase
    .from("service_requests")
    .insert({
      user_id: access.profile.id,
      service_type: serviceType,
      latitude,
      longitude,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      is_demo: false,
    })
    .select("id,service_type,status,latitude,longitude,notes,created_at,updated_at,is_demo")
    .single();

  if (error) {
    console.error("Roadside request creation failed", error.message);
    return errorResponse("REQUEST_CREATE_FAILED", "Your request could not be sent.", 503);
  }
  return NextResponse.json({ request: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
