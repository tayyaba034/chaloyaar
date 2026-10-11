import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const validFuels = new Set(["petrol", "diesel", "cng"]);
const validStatuses = new Set(["unverified", "pending", "verified", "rejected"]);

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("station_public")
    .select("id,name,brand,address,latitude,longitude,supported_fuels,verification_status,is_demo,source,source_url,updated_at")
    .order("name")
    .limit(200);
  if (error) {
    console.error("Admin stations query failed", error.message);
    return errorResponse("STATIONS_UNAVAILABLE", "Stations are temporarily unavailable.", 503);
  }
  return NextResponse.json({ stations: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("INVALID_JSON", "Send valid JSON."); }
  if (!body || typeof body !== "object") return errorResponse("VALIDATION_ERROR", "Enter valid station details.");
  const payload = body as Record<string, unknown>;
  const stationId = typeof payload.stationId === "string" ? payload.stationId : "";
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const brand = typeof payload.brand === "string" ? payload.brand : "";
  const address = typeof payload.address === "string" ? payload.address : "";
  const fuels = Array.isArray(payload.supportedFuels) ? payload.supportedFuels.filter((fuel): fuel is string => typeof fuel === "string") : [];
  const verificationStatus = typeof payload.verificationStatus === "string" ? payload.verificationStatus : "";
  if (!stationId || !name || name.length > 200 || fuels.some((fuel) => !validFuels.has(fuel)) || !validStatuses.has(verificationStatus)) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid name, fuel list and verification status.");
  }
  const { data, error } = await access.supabase.rpc("admin_update_station", {
    target_station_id: stationId,
    target_name: name,
    target_brand: brand,
    target_address: address,
    target_supported_fuels: fuels,
    target_verification_status: verificationStatus,
  });
  if (error) {
    console.error("Admin station update failed", error.message);
    return errorResponse("STATION_UPDATE_FAILED", "The station could not be updated.", 503);
  }
  return NextResponse.json({ station: data }, { headers: { "Cache-Control": "no-store" } });
}
