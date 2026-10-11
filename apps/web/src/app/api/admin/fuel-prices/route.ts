import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";

const fuelTypes = new Set(["petrol", "diesel", "cng"]);

function errorResponse(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;

  const { data, error } = await access.supabase
    .from("fuel_prices")
    .select("id,fuel_type,price_per_litre,source_name,source_url,effective_at,expires_at,verified_at,station_id,entered_at,is_demo")
    .order("effective_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("Admin fuel price query failed", error.message);
    return errorResponse("FUEL_PRICES_UNAVAILABLE", "Fuel prices are temporarily unavailable.", 503);
  }
  return NextResponse.json({ prices: data ?? [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
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
  if (!body || typeof body !== "object") return errorResponse("VALIDATION_ERROR", "Enter all price details.");

  const payload = body as Record<string, unknown>;
  const fuelType = typeof payload.fuelType === "string" ? payload.fuelType : "";
  const amount = Number(payload.pricePerLitre);
  const sourceName = typeof payload.sourceName === "string" ? payload.sourceName.trim() : "";
  const sourceUrl = typeof payload.sourceUrl === "string" ? payload.sourceUrl.trim() : "";
  const effectiveAt = new Date(String(payload.effectiveAt ?? ""));
  const expiresAt = new Date(String(payload.expiresAt ?? ""));
  const stationId = typeof payload.stationId === "string" && payload.stationId ? payload.stationId : null;
  if (payload.priceChecked !== "on" && payload.priceChecked !== true) return errorResponse("VALIDATION_ERROR", "Check the price source and validity before saving.");
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt <= effectiveAt) return errorResponse("VALIDATION_ERROR", "Enter an expiry after the effective date and current time.");
  if (stationId) {
    const station = await access.supabase.from("station_public").select("id,supported_fuels,is_demo,verification_status").eq("id",stationId).maybeSingle();
    if (station.error || !station.data || station.data.is_demo || station.data.verification_status !== "verified" || !station.data.supported_fuels.includes(fuelType)) return errorResponse("VALIDATION_ERROR", "Station-specific prices require a verified station with matching fuel metadata.");
  }

  if (!fuelTypes.has(fuelType)) return errorResponse("VALIDATION_ERROR", "Choose petrol, diesel or CNG.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) {
    return errorResponse("VALIDATION_ERROR", "Price must be greater than zero and below 10,000 per litre.");
  }
  if (!sourceName || sourceName.length > 200) return errorResponse("VALIDATION_ERROR", "Enter a source name.");
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (parsed.protocol !== "https:") throw new Error("HTTPS required");
    } catch {
      return errorResponse("VALIDATION_ERROR", "Source URL must be a valid HTTPS URL.");
    }
  }
  if (Number.isNaN(effectiveAt.getTime()) || effectiveAt.getTime() > Date.now()) {
    return errorResponse("VALIDATION_ERROR", "Effective date must be valid and cannot be in the future.");
  }

  const { data, error } = await access.supabase
    .from("fuel_prices")
    .insert({
      fuel_type: fuelType,
      price_per_litre: amount,
      source_name: sourceName,
      source_url: sourceUrl || null,
      effective_at: effectiveAt.toISOString(),
      expires_at: expiresAt.toISOString(),
      verified_at: new Date().toISOString(),
      station_id: stationId,
      entered_by: access.profile.id,
      is_demo: false,
    })
    .select("id,fuel_type,price_per_litre,source_name,source_url,effective_at,entered_at,is_demo")
    .single();
  if (error) {
    console.error("Admin fuel price creation failed", error.message);
    return errorResponse("FUEL_PRICE_SAVE_FAILED", "The fuel price could not be saved.", 503);
  }
  return NextResponse.json({ price: data }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}
