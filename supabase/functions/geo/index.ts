// Supabase Edge Function entry point for the geo service. Deploy with:
//   supabase functions deploy geo
//   supabase secrets set ORS_API_KEY=... OSRM_BASE_URL=... NOMINATIM_BASE_URL=... NOMINATIM_CONTACT_EMAIL=...
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { handleGeoRequest } from "./handler.ts";
import type { RouteCache } from "../_shared/geo/route-cache.ts";
import type { MatrixCell, MatrixSource } from "../_shared/geo/matrix.ts";

declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const rest = (path: string, init: RequestInit = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
  ...init,
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
});

const recent = new Map<string, number[]>();
function rateLimit(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 30) return false;
  recent.set(userId, [...times, now]);
  return true;
}

const cache: RouteCache = {
  async get(pairs) {
    const found = new Map<string, MatrixCell>();
    const froms = [...new Set(pairs.map((pair) => pair.fromKey))];
    const response = await rest(`route_estimates?select=from_key,to_key,provider,distance_m,duration_s&from_key=in.(${froms.map((key) => `"${key}"`).join(",")})&expires_at=gt.${new Date().toISOString()}`);
    if (!response.ok) return found;
    for (const row of await response.json() as Array<{ from_key: string; to_key: string; provider: MatrixSource; distance_m: number; duration_s: number }>) {
      found.set(`${row.from_key}|${row.to_key}`, { distanceKm: row.distance_m / 1000, durationMin: row.duration_s / 60, source: row.provider });
    }
    return found;
  },
  async put(entries) {
    await rest("route_estimates?on_conflict=from_key,to_key,provider", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(entries.map(({ fromKey, toKey, cell }) => ({
        from_key: fromKey, to_key: toKey, provider: cell.source, distance_m: cell.distanceKm * 1000, duration_s: cell.durationMin * 60,
        fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }))),
    });
  },
};

Deno.serve((request) => handleGeoRequest(request, {
  async verifyUser(authorization) {
    if (!authorization?.startsWith("Bearer ")) return null;
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: authorization } });
    if (!response.ok) return null;
    const user = await response.json() as { id?: string };
    return user.id ?? null;
  },
  routing: { orsApiKey: Deno.env.get("ORS_API_KEY") ?? null, osrmBaseUrl: Deno.env.get("OSRM_BASE_URL") ?? null },
  cache,
  gazetteer: async (query, near) => {
    const response = await rest("rpc/search_places", {
      method: "POST",
      body: JSON.stringify({ query, near_latitude: near?.latitude ?? null, near_longitude: near?.longitude ?? null, max_results: 5 }),
    });
    if (!response.ok) throw new Error("gazetteer unavailable");
    const rows = await response.json() as Array<{ id: string; name_en: string; kind: string; latitude: number; longitude: number }>;
    return rows.map((row) => ({ id: row.id, nameEn: row.name_en, kind: row.kind, latitude: row.latitude, longitude: row.longitude }));
  },
  nominatim: { baseUrl: Deno.env.get("NOMINATIM_BASE_URL") ?? null, contactEmail: Deno.env.get("NOMINATIM_CONTACT_EMAIL") ?? null },
  rateLimit,
}));
