import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const services = new Set(["puncture", "battery", "towing"]);

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const access = await requireApiRole("provider");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("providers")
    .select("id,verification_status,service_types,active,is_demo")
    .eq("id", access.profile.id)
    .maybeSingle();
  if (error) {
    console.error("Provider settings query failed", error.message);
    return errorResponse("PROVIDER_SETTINGS_UNAVAILABLE", "Provider settings are temporarily unavailable.", 503);
  }
  if (!data) return errorResponse("PROVIDER_NOT_FOUND", "Provider profile was not found.", 404);
  return NextResponse.json({ provider: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("provider");
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("INVALID_JSON", "Send valid JSON."); }
  if (!body || typeof body !== "object") return errorResponse("VALIDATION_ERROR", "Choose at least one service or go offline.");
  const payload = body as Record<string, unknown>;
  const serviceTypes = Array.isArray(payload.serviceTypes)
    ? payload.serviceTypes.filter((service): service is string => typeof service === "string")
    : [];
  const active = payload.active === true;
  if (serviceTypes.some((service) => !services.has(service))) {
    return errorResponse("VALIDATION_ERROR", "Choose valid roadside services.");
  }
  const { data, error } = await access.supabase.rpc("update_provider_settings", {
    target_service_types: serviceTypes,
    target_active: active,
  });
  if (error) {
    console.error("Provider settings update failed", error.message);
    return errorResponse("PROVIDER_SETTINGS_UPDATE_FAILED", "Provider settings could not be updated.", 503);
  }
  return NextResponse.json({ provider: data }, { headers: { "Cache-Control": "no-store" } });
}
