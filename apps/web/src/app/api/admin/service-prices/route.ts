import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const serviceTypes = new Set(["tyre_repair", "battery_help", "towing", "portable_diesel_delivery"]);

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase.from("service_prices").select("service_type,price_pkr,source_name,updated_at").order("service_type");
  if (error) {
    console.error("Admin service price query failed", error.message);
    return errorResponse("SERVICE_PRICES_UNAVAILABLE", "Service prices are temporarily unavailable.", 503);
  }
  return NextResponse.json({ prices: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse("INVALID_JSON", "Send valid JSON."); }
  if (!body || typeof body !== "object") return errorResponse("VALIDATION_ERROR", "Enter a service and price.");
  const payload = body as Record<string, unknown>;
  const serviceType = typeof payload.serviceType === "string" ? payload.serviceType : "";
  const pricePkr = Number(payload.pricePkr);
  const sourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
  if (!serviceTypes.has(serviceType) || !Number.isFinite(pricePkr) || pricePkr < 0 || pricePkr > 10_000_000 || !sourceName || sourceName.length > 200) {
    return errorResponse("VALIDATION_ERROR", "Enter a valid service price and source.");
  }
  const { data, error } = await access.supabase.from("service_prices").upsert({
    service_type: serviceType,
    price_pkr: pricePkr,
    source_name: sourceName,
    updated_by: access.profile.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "service_type" }).select("service_type,price_pkr,source_name,updated_at").single();
  if (error) {
    console.error("Admin service price update failed", error.message);
    return errorResponse("SERVICE_PRICE_SAVE_FAILED", "The service price could not be saved.", 503);
  }
  return NextResponse.json({ price: data }, { headers: { "Cache-Control": "no-store" } });
}
