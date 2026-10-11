import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { resolveAvailabilityStatus } from "@/lib/availability";

const PILOT_ORIGIN = { latitude: 31.4181, longitude: 73.0791 };

function distanceKm(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(first.latitude);
  const lat2 = radians(second.latitude);
  const dLat = lat2 - lat1;
  const dLon = radians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const { profile, supabase } = access;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();

  const [stationResult, fuelPriceResult, fuelLogsResult, requestResult] =
    await Promise.all([
      supabase
        .from("station_public")
        .select("id,name,brand,address,latitude,longitude,supported_fuels,is_demo,source,source_url,updated_at")
        .order("name")
        .limit(100),
      supabase
        .from("fuel_prices")
        .select("price_per_litre,source_name,effective_at,entered_at,is_demo")
        .eq("fuel_type", "petrol")
        .lte("effective_at", now.toISOString())
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("fuel_logs")
        .select("litres,total_amount,odometer_km,logged_at,is_demo")
        .eq("user_id", profile.id)
        .gte("logged_at", yearAgo)
        .order("logged_at", { ascending: true })
        .limit(200),
      supabase
        .from("service_requests")
        .select("id,service_type,status,is_demo,created_at")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const failed = [stationResult, fuelPriceResult, fuelLogsResult, requestResult].find(
    (result) => result.error,
  );
  if (failed?.error) {
    console.error("Driver dashboard query failed", failed.error.message);
    return NextResponse.json(
      { error: { code: "DASHBOARD_QUERY_FAILED", message: "Dashboard information is temporarily unavailable." } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const stations = (stationResult.data ?? [])
    .filter(
      (station) =>
        Array.isArray(station.supported_fuels) &&
        station.supported_fuels.includes("petrol"),
    )
    .map((station) => ({
      ...station,
      latitude: Number(station.latitude),
      longitude: Number(station.longitude),
    }))
    .filter((station) => Number.isFinite(station.latitude) && Number.isFinite(station.longitude))
    .map((station) => ({
      ...station,
      distanceKm: distanceKm(PILOT_ORIGIN, station),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
  const nearest = stations[0] ?? null;

  let availability: Record<string, unknown> = {
    state: "unknown",
    source: null,
    reportedAt: null,
    isDemo: false,
  };
  if (nearest) {
    const { data: report, error } = await supabase
      .from("availability_reports")
      .select("reported_status,source_type,reported_at,expires_at,is_demo")
      .eq("station_id", nearest.id)
      .eq("fuel_type", "petrol")
      .eq("moderation_status", "approved")
      .order("reported_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Nearest station report lookup failed", error.message);
      return NextResponse.json(
        { error: { code: "DASHBOARD_QUERY_FAILED", message: "Dashboard information is temporarily unavailable." } },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (report) {
      availability = {
        state: resolveAvailabilityStatus(report, now),
        source: report.source_type,
        reportedAt: report.reported_at,
        isDemo: report.is_demo,
      };
    }
  }

  const fuelLogs = fuelLogsResult.data ?? [];
  const monthLogs = fuelLogs.filter((log) => log.logged_at >= monthStart);
  const totalSpend = monthLogs.reduce((sum, log) => sum + Number(log.total_amount), 0);
  const odometerLogs = fuelLogs.filter(
    (log) => log.odometer_km !== null && Number.isFinite(Number(log.odometer_km)),
  );
  const firstOdometer = odometerLogs[0];
  const lastOdometer = odometerLogs.at(-1);
  const totalLitres = fuelLogs.reduce((sum, log) => sum + Number(log.litres), 0);
  const drivenKm =
    firstOdometer && lastOdometer
      ? Number(lastOdometer.odometer_km) - Number(firstOdometer.odometer_km)
      : 0;
  const kmPerLitre = drivenKm > 0 && totalLitres > 0 ? drivenKm / totalLitres : null;
  const activeRequest = (requestResult.data ?? []).find(
    (request) => !["completed", "cancelled"].includes(request.status),
  );

  return NextResponse.json(
    {
      profile: { displayName: profile.displayName },
      nearestStation: nearest
        ? {
            id: nearest.id,
            name: nearest.name,
            latitude: nearest.latitude,
            longitude: nearest.longitude,
            distanceKm: nearest.distanceKm,
            source: nearest.source,
            updatedAt: nearest.updated_at,
            isDemo: nearest.is_demo,
            availability,
          }
        : null,
      activeRequest: activeRequest ?? null,
      monthlySpend: monthLogs.length ? totalSpend : null,
      kmPerLitre,
      officialPrice: fuelPriceResult.data
        ? {
            pricePerLitre: Number(fuelPriceResult.data.price_per_litre),
            source: fuelPriceResult.data.source_name,
            effectiveAt: fuelPriceResult.data.effective_at,
            checkedAt: fuelPriceResult.data.entered_at,
            isDemo: fuelPriceResult.data.is_demo,
          }
        : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
