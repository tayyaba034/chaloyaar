import { NextResponse } from "next/server";
import { getDiscoveryAvailability, getNearbyStations } from "@/lib/stations";
import { stationAreas, parseStationSearch } from "@/lib/station-search";
import type { FuelType } from "@/lib/station-data";
import { isVerifiedStation } from "@/lib/station-discovery-facts";

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
  const report = best.reportedAt ? ` Reported at ${new Date(best.reportedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}.` : " No current availability report is available.";
  if (locale === "ur") return `${best.name} تقریباً ${best.distanceKm.toFixed(1)} کلومیٹر دور ہے۔ حالت: ${best.state}.${report}`;
  if (locale === "pa-Arab") return `${best.name} لگ بھگ ${best.distanceKm.toFixed(1)} کلومیٹر دور اے۔ حال: ${best.state}.${report}`;
  if (locale === "ur-Latn") return `${best.name} taqreeban ${best.distanceKm.toFixed(1)} km door hai. Haal: ${best.state}.${report}`;
  return `${best.name} is about ${best.distanceKm.toFixed(1)} km away. Status: ${best.state}.${report}`;
}

export async function POST(request: Request) {
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

  const fuel = inferFuel(message);
  const areaId = inferArea(message);
  try {
    const search = parseStationSearch({
      radiusKm: 15,
      ...(typeof input.lat === "number" && typeof input.lng === "number"
        ? { lat: input.lat, lng: input.lng }
        : { areaId }),
      ...(fuel ? { fuelType: fuel } : {}),
    });
    const found = await getNearbyStations(search);
    const stations = found.filter((station) => !fuel || station.supportedFuels.includes(fuel));
    const facts = await getDiscoveryAvailability(stations.map((station) => station.id), fuel ?? "petrol");
    const sources = stations.slice(0, 5).map((station) => ({
      stationId: station.id,
      name: station.name,
      distanceKm: station.distanceKm,
      verified: isVerifiedStation(station),
      availability: facts[station.id]?.state ?? "unknown",
      reportedAt: facts[station.id]?.reportedAt ?? null,
    })).sort((a, b) => {
      const stateScore = (state: string) => state === "available" ? 0 : state === "queue_reported" ? 1 : state === "stale" ? 2 : 3;
      return stateScore(a.availability) - stateScore(b.availability) || a.distanceKm - b.distanceKm;
    });
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
      limitation: "Availability is based on reports and is not a guarantee of stock.",
      area: stationAreas[areaId as keyof typeof stationAreas],
    }, { headers });
  } catch {
    return NextResponse.json({ error: { code: "ASSISTANT_UNAVAILABLE", message: "Station information is temporarily unavailable. Please retry." } }, { status: 503, headers });
  }
}
