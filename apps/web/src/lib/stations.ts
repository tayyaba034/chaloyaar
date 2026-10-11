import "server-only";
import { createClient } from "@supabase/supabase-js";
import { demoStations, type FuelType, type Station } from "./station-data";
import { getSupabaseConfig } from "./supabase-config";
import { resolveAvailabilityStatus } from "./availability";
import type { StationSearch } from "./station-search";
import type { RouteCandidate } from "./route-comparison";
import type { RouteEstimate } from "./routing";

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
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : null,
  };
}

function stationClient() {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error("Supabase station data is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getStationById(id: string): Promise<Station | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const { data, error } = await stationClient().from("station_public")
    .select("id,name,brand,address,latitude,longitude,supported_fuels,verification_status,is_demo,source,source_url,updated_at,verified_at")
    .eq("id", id).eq("is_demo", false).neq("verification_status", "rejected").maybeSingle();
  if (error) throw new Error("Station details are temporarily unavailable.");
  return data ? parseStation(data) : null;
}

export async function getNearbyStations(search: StationSearch) {
  const { data, error } = await stationClient().rpc("nearby_stations", {
    search_latitude: search.latitude, search_longitude: search.longitude,
    radius_km: search.radiusKm, requested_fuel: search.fuelType,
  });
  if (error) throw new Error("Nearby station data is temporarily unavailable.");
  return (data as Record<string, unknown>[]).flatMap((row) => {
    const station = parseStation(row);
    return station ? [{ ...station, distanceKm: Number(row.distance_km), distanceKind: "straight_line_approximate" as const }] : [];
  });
}

export async function getDiscoveryAvailability(stationIds: string[], fuel: FuelType) {
  const facts: Record<string, {
    state: ReturnType<typeof resolveAvailabilityStatus>;
    source: "user" | "station" | "admin";
    reportedAt: string;
    expiresAt: string;
  }> = {};
  if (!stationIds.length) return facts;
  const { data, error } = await stationClient().rpc("station_latest_reports", {
    station_ids: stationIds, requested_fuel: fuel,
  });
  if (error) throw new Error("Station reports are temporarily unavailable.");
  for (const row of data ?? []) {
    facts[row.station_id] = {
      state: resolveAvailabilityStatus(row), source: row.source_type,
      reportedAt: row.reported_at, expiresAt: row.expires_at,
    };
  }
  return facts;
}

export async function getStationsAlongRoute(client: ReturnType<typeof stationClient>, geometry: NonNullable<RouteEstimate["geometry"]>, fuel: FuelType): Promise<RouteCandidate[]> {
  const { data, error } = await client.rpc("route_stations", { route_geometry: geometry, requested_fuel: fuel });
  if (error) {
    console.error("Route station lookup failed", error.code);
    throw new Error("Route station data is temporarily unavailable.");
  }
  return (data as Record<string, unknown>[]).flatMap(row => {
    const station = parseStation(row);
    return station ? [{ ...station, corridorDistanceKm: Number(row.corridor_distance_km), price: row.price as RouteCandidate["price"] }] : [];
  });
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
    state: "available" | "unavailable" | "queue_reported" | "stale";
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
      .eq("is_demo",false)
      .is("station_id", null)
      .lte("effective_at", now)
      .order("effective_at", { ascending: false })
      .limit(20),
    supabase
      .from("availability_reports")
      .select("station_id,fuel_type,reported_status,source_type,reported_at,expires_at")
      .eq("is_demo",false)
      .in("station_id", stationIds)
      .eq("moderation_status", "approved")
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
        state: resolveAvailabilityStatus({ reported_status:reportedStatus,expires_at:row.expires_at }) as "available"|"unavailable"|"queue_reported"|"stale",
        source: sourceType,
        reportedAt: row.reported_at,
      };
    }
  }
  return { prices, availability };
}
