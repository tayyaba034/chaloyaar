import "server-only";
import { createClient } from "@supabase/supabase-js";
import { geocode, type GeocodeOutcome } from "@geo/geocode.ts";
import { routeThrough, type OrderedRoute, type RoutingConfig, type TravelMatrix } from "@geo/matrix.ts";
import { cachedTravelMatrix, type RouteCache } from "@geo/route-cache.ts";
import { compareOrders, solveItinerary, type SolveResult, type SolverProblem } from "@geo/solver/index.ts";
import type { LatLng } from "@geo/types.ts";
import { getSupabaseConfig } from "../supabase-config";
import { getPublicSupabaseClient } from "../supabase-public";
import { log } from "../log";

// One entry point for the geo service. With GEO_FUNCTION_URL set it calls the Supabase Edge
// Function (keys stay in function secrets); otherwise, or if the function is unreachable, it runs
// the same geo-core code in-process. Every result says which engine produced it.
export type GeoEngine = "edge_function" | "in_process";
export type Engined<T> = T & { engine: GeoEngine; engineNote?: string };

function routingConfig(): RoutingConfig {
  return {
    orsApiKey: process.env.OPENROUTESERVICE_API_KEY?.trim() || null,
    osrmBaseUrl: process.env.OSRM_BASE_URL?.trim() || null,
  };
}

export function routingStatus() {
  const config = routingConfig();
  return { roadRouting: Boolean(config.orsApiKey || config.osrmBaseUrl), provider: config.orsApiKey ? "openrouteservice" : config.osrmBaseUrl ? "osrm" : null };
}

function serviceCache(): RouteCache | null {
  const { url } = getSupabaseConfig();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async get(pairs) {
      const froms = [...new Set(pairs.map((pair) => pair.fromKey))];
      const { data } = await client.from("route_estimates").select("from_key,to_key,provider,distance_m,duration_s")
        .in("from_key", froms).gt("expires_at", new Date().toISOString());
      return new Map((data ?? []).map((row) => [`${row.from_key}|${row.to_key}`, { distanceKm: Number(row.distance_m) / 1000, durationMin: Number(row.duration_s) / 60, source: row.provider }]));
    },
    async put(entries) {
      await client.from("route_estimates").upsert(entries.map(({ fromKey, toKey, cell }) => ({
        from_key: fromKey, to_key: toKey, provider: cell.source, distance_m: cell.distanceKm * 1000, duration_s: cell.durationMin * 60,
        fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })), { onConflict: "from_key,to_key,provider" });
    },
  };
}

async function callFunction<T>(path: string, body: unknown, accessToken: string | null): Promise<T | null> {
  const base = process.env.GEO_FUNCTION_URL?.trim();
  if (!base || !accessToken) return null;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!response.ok) {
      log.warn("geo_function_failed", { path, status: response.status });
      return null;
    }
    return await response.json() as T;
  } catch {
    log.warn("geo_function_unreachable", { path });
    return null;
  }
}

const fallbackNote = () => (process.env.GEO_FUNCTION_URL ? "geo_function_unreachable_used_in_process" : undefined);

export async function travelMatrix(points: LatLng[], accessToken: string | null): Promise<Engined<TravelMatrix>> {
  const remote = await callFunction<TravelMatrix>("/matrix", { points }, accessToken);
  if (remote) return { ...remote, engine: "edge_function" };
  return { ...(await cachedTravelMatrix(points, routingConfig(), serviceCache())), engine: "in_process", engineNote: fallbackNote() };
}

export async function orderedRoute(points: LatLng[], accessToken: string | null): Promise<Engined<OrderedRoute>> {
  const remote = await callFunction<OrderedRoute>("/route", { points }, accessToken);
  if (remote) return { ...remote, engine: "edge_function" };
  return { ...(await routeThrough(points, routingConfig())), engine: "in_process", engineNote: fallbackNote() };
}

export type OptimizeResponse = { result: SolveResult; comparison: ReturnType<typeof compareOrders> | null };

export async function optimize(problem: SolverProblem, userOrder: number[] | null, accessToken: string | null): Promise<Engined<OptimizeResponse>> {
  const remote = await callFunction<OptimizeResponse>("/optimize", { problem, userOrder }, accessToken);
  if (remote) return { ...remote, engine: "edge_function" };
  const result = solveItinerary(problem, { timeLimitMs: 1200 });
  return {
    result,
    comparison: result.status === "ok" && userOrder ? compareOrders(problem, userOrder, result.best) : null,
    engine: "in_process",
    engineNote: fallbackNote(),
  };
}

export async function geocodeText(query: string, near: LatLng | null): Promise<GeocodeOutcome> {
  const client = getPublicSupabaseClient();
  return geocode(query, near, {
    gazetteer: client ? async (text, origin) => {
      const { data, error } = await client.rpc("search_places", { query: text, near_latitude: origin?.latitude ?? null, near_longitude: origin?.longitude ?? null, max_results: 5 });
      if (error) throw new Error(error.message);
      return (data as Array<Record<string, unknown>>).map((row) => ({ id: String(row.id), nameEn: String(row.name_en), kind: String(row.kind), latitude: Number(row.latitude), longitude: Number(row.longitude) }));
    } : null,
    nominatimBaseUrl: process.env.NOMINATIM_BASE_URL?.trim() || null,
    nominatimContactEmail: process.env.NOMINATIM_CONTACT_EMAIL?.trim() || null,
  });
}
