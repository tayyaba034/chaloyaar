import "server-only";
import { createClient } from "@supabase/supabase-js";
import { demoStations, type FuelType, type Station } from "./station-data";
import { getSupabaseConfig } from "./supabase-config";

export { demoStations };
export type { FuelType, Station };

function parseStation(row: Record<string, unknown>): Station | null {
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  const fuels = Array.isArray(row.supported_fuels)
    ? row.supported_fuels.filter(
        (fuel): fuel is FuelType =>
          fuel === "petrol" || fuel === "diesel" || fuel === "cng",
      )
    : [];
  const status = row.verification_status;
  const verificationStatus =
    status === "pending" || status === "verified" || status === "rejected"
      ? status
      : "unverified";

  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "Unnamed station",
    brand: typeof row.brand === "string" ? row.brand : null,
    address: typeof row.address === "string" ? row.address : null,
    latitude,
    longitude,
    supportedFuels: fuels,
    verificationStatus,
    isDemo: row.is_demo === true,
    source: typeof row.source === "string" ? row.source : "Unknown",
    sourceUrl: typeof row.source_url === "string" ? row.source_url : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getStations(): Promise<Station[]> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    throw new Error("Supabase station data is not configured.");
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("station_public")
    .select(
      "id,name,brand,address,latitude,longitude,supported_fuels,verification_status,is_demo,source,source_url,updated_at",
    )
    .order("name")
    .limit(100);

  if (error) {
    console.error("Station query failed", error.message);
    throw new Error("Station data is temporarily unavailable.");
  }

  return (data as Record<string, unknown>[])
    .map(parseStation)
    .filter((station): station is Station => station !== null);
}

export type StationLiveFacts = {
  prices: Partial<Record<FuelType, {
    amount: number;
    source: string;
    effectiveAt: string;
  }>>;
  availability: Record<string, Partial<Record<FuelType, {
    state: "available" | "unavailable" | "queue_reported";
    source: "user" | "station" | "admin";
    reportedAt: string;
  }>>>;
};

function isFuelType(value: unknown): value is FuelType {
  return value === "petrol" || value === "diesel" || value === "cng";
}

export async function getStationLiveFacts(stationIds: string[]): Promise<StationLiveFacts> {
  const { url, key } = getSupabaseConfig();
  if (!url || !key || stationIds.length === 0) return { prices: {}, availability: {} };

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const [pricesResult, availabilityResult] = await Promise.all([
    supabase
      .from("fuel_prices")
      .select("fuel_type,price_per_litre,source_name,effective_at")
      .lte("effective_at", now)
      .order("effective_at", { ascending: false })
      .limit(20),
    supabase
      .from("availability_reports")
      .select("station_id,fuel_type,reported_status,source_type,reported_at")
      .in("station_id", stationIds)
      .eq("moderation_status", "approved")
      .gt("expires_at", now)
      .order("reported_at", { ascending: false })
      .limit(300),
  ]);
  if (pricesResult.error) {
    console.error("Fuel price query failed; showing unknown prices", pricesResult.error.message);
  }
  if (availabilityResult.error) {
    console.error(
      "Availability query failed; showing unknown availability",
      availabilityResult.error.message,
    );
  }

  const prices: StationLiveFacts["prices"] = {};
  for (const row of pricesResult.error ? [] : pricesResult.data ?? []) {
    const fuelType: unknown = row.fuel_type;
    if (
      isFuelType(fuelType) &&
      !prices[fuelType]
    ) {
      prices[fuelType] = {
        amount: Number(row.price_per_litre),
        source: row.source_name,
        effectiveAt: row.effective_at,
      };
    }
  }

  const availability: StationLiveFacts["availability"] = {};
  for (const row of availabilityResult.error ? [] : availabilityResult.data ?? []) {
    const fuelType: unknown = row.fuel_type;
    const reportedStatus: unknown = row.reported_status;
    const sourceType: unknown = row.source_type;
    if (
      !isFuelType(fuelType) ||
      (reportedStatus !== "available" && reportedStatus !== "unavailable" && reportedStatus !== "queue_reported") ||
      (sourceType !== "user" && sourceType !== "station" && sourceType !== "admin")
    ) continue;
    const stationFacts = availability[row.station_id] ??= {};
    if (!stationFacts[fuelType]) {
      stationFacts[fuelType] = {
        state: reportedStatus,
        source: sourceType,
        reportedAt: row.reported_at,
      };
    }
  }
  return { prices, availability };
}
