import { NextResponse } from "next/server";
import { stationAreas } from "@/lib/station-search";
import type { FuelType } from "@/lib/station-data";
import { findStations } from "@/lib/assistant/find-stations";
import { runAgent } from "@/lib/assistant/agent";
import { geminiGenerate, getGeminiConfig } from "@/lib/assistant/gemini";
import { allowAssistantRequest } from "@/lib/assistant/rate-limit";

const headers = { "Cache-Control": "private, no-store" };
function inferFuel(message: string): FuelType | null {
  const value = message.toLocaleLowerCase();
  if (/\b(diesel|ڈیزل)\b/.test(value)) return "diesel";
  if (/\b(cng|سی\s*این\s*جی)\b/.test(value)) return "cng";
  if (/\b(petrol|gas|fuel|پٹرول|پیٹرول|ایندھن)\b/.test(value)) return "petrol";
  return null;
}

function inferArea(message: string) {
  const value = message.toLocaleLowerCase().replace(/[\s-]+/g, "");
  if (value.includes("susan") || value.includes("سوسن")) return "susan-road";
  if (value.includes("dground") || value.includes("ڈیگراؤنڈ")) return "d-ground";
  return "city-centre";
}

function localAnswer(locale: string, fuel: FuelType | null, stations: Array<{
  name: string;
  distanceKm: number;
  state: string;
  reportedAt: string | null;
  verified: boolean;
}>) {
  const fuelName = fuel === "diesel" ? "diesel" : fuel === "cng" ? "CNG" : "petrol";
  if (!stations.length) {
    if (locale === "ur") return `${fuelName} کے لیے کوئی تصدیق شدہ قریبی اسٹیشن نہیں ملا۔ دستیاب معلومات نامکمل ہو سکتی ہے۔`;
    if (locale === "pa-Arab") return `${fuelName} لئی کوئی تصدیق شدہ نیڑے دا اسٹیشن نئیں لبھیا۔`;
    if (locale === "ur-Latn") return `${fuelName} ke liye koi tasdeeq shuda qareebi station nahi mila. Maloomat mukammal nahi ho sakti.`;
    return `I could not find a verified nearby station with usable ${fuelName} information. Station coverage may be incomplete.`;
  }
  const best = stations[0];
  const time = best.reportedAt ? new Date(best.reportedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }) : null;
  if (locale === "ur") return `${best.name} تقریباً ${best.distanceKm.toFixed(1)} کلومیٹر دور ہے۔ حالت: ${best.state}۔ ${time ? `رپورٹ کا وقت: ${time}۔` : "دستیابی کی کوئی تازہ رپورٹ موجود نہیں۔"}`;
  if (locale === "pa-Arab") return `${best.name} لگ بھگ ${best.distanceKm.toFixed(1)} کلومیٹر دور اے۔ حال: ${best.state}۔ ${time ? `رپورٹ دا ویلا: ${time}۔` : "دستیابی دی کوئی تازہ رپورٹ نئیں۔"}`;
  if (locale === "ur-Latn") return `${best.name} taqreeban ${best.distanceKm.toFixed(1)} km door hai. Haal: ${best.state}. ${time ? `Report ka waqt: ${time}.` : "Dastiyabi ki koi taaza report maujood nahi."}`;
  return `${best.name} is about ${best.distanceKm.toFixed(1)} km away. Status: ${best.state}. ${time ? `Reported at ${time}.` : "No current availability report is available."}`;
}

function clientKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

function readOrigin(input: Record<string, unknown>) {
  const { lat, lng } = input;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { latitude: lat, longitude: lng } : null;
}

export async function POST(request: Request) {
  if (!allowAssistantRequest(clientKey(request))) {
    return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many questions. Please wait a minute and try again." } }, { status: 429, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON", message: "Send valid JSON." } }, { status: 400, headers });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Send an assistant message." } }, { status: 400, headers });
  }
  const input = body as Record<string, unknown>;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const locale = input.locale === "ur" || input.locale === "ur-Latn" || input.locale === "pa-Arab" ? input.locale : "en";
  if (!message || message.length > 500) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Message must be between 1 and 500 characters." } }, { status: 400, headers });
  }
  const origin = readOrigin(input);
  const limitation = "Availability is based on reports and is not a guarantee of stock.";

  const gemini = getGeminiConfig();
  if (gemini) {
    try {
      const result = await runAgent({ message, locale, origin, generate: geminiGenerate(gemini), findStations });
      if (result) return NextResponse.json({ ...result, limitation, mode: "ai" }, { headers });
    } catch (failure) {
      console.error("Assistant agent failed", failure instanceof Error ? failure.name : "Unknown failure");
    }
  }

  const fuel = inferFuel(message);
  const areaId = inferArea(message);
  try {
    const sources = await findStations({ fuel, areaId, origin });
    const answer = localAnswer(locale, fuel, sources.map((source) => ({
      name: source.name,
      distanceKm: source.distanceKm,
      state: source.availability,
      reportedAt: source.reportedAt,
      verified: source.verified,
    })));
    return NextResponse.json({
      answer,
      sources,
      action: null,
      limitation,
      mode: "basic",
      area: stationAreas[areaId],
    }, { headers });
  } catch {
    return NextResponse.json({ error: { code: "ASSISTANT_UNAVAILABLE", message: "Station information is temporarily unavailable. Please retry." } }, { status: 503, headers });
  }
}
