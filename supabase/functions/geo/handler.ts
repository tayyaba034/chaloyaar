// Geo service HTTP handler (pure Request -> Response) used by the Supabase Edge Function in
// index.ts. Dependencies are injected so it can be tested without Deno or a network.
import { checkCoordinates } from "../_shared/geo/validate.ts";
import { geocode, type GazetteerSearch } from "../_shared/geo/geocode.ts";
import { routeThrough, type RoutingConfig } from "../_shared/geo/matrix.ts";
import { cachedTravelMatrix, type RouteCache } from "../_shared/geo/route-cache.ts";
import { solveItinerary, compareOrders, type SolverProblem } from "../_shared/geo/solver/index.ts";
import type { LatLng } from "../_shared/geo/types.ts";

export type GeoDeps = {
  verifyUser: (authorization: string | null) => Promise<string | null>;
  routing: RoutingConfig;
  cache: RouteCache | null;
  gazetteer: GazetteerSearch | null;
  nominatim: { baseUrl: string | null; contactEmail: string | null };
  rateLimit: (userId: string) => boolean;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" },
});
const error = (code: string, message: string, status: number) => json({ error: { code, message } }, status);

function readPoints(value: unknown, max = 25): LatLng[] | string {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) return `Send between 1 and ${max} points.`;
  const points: LatLng[] = [];
  for (const item of value) {
    const record = item as Record<string, unknown> | null;
    const check = checkCoordinates(record?.latitude, record?.longitude);
    if (!check.valid) return check.message;
    points.push(check.point);
  }
  return points;
}

function readProblem(value: unknown): SolverProblem | string {
  const problem = value as SolverProblem | null;
  if (!problem || !Array.isArray(problem.stops) || problem.stops.length > 25) return "Send a problem with up to 25 stops.";
  if (!Array.isArray(problem.distanceKm) || !Array.isArray(problem.durationMin) || typeof problem.weights !== "object") return "Send distance and duration matrices and weights.";
  return problem;
}

export async function handleGeoRequest(request: Request, deps: GeoDeps): Promise<Response> {
  if (request.method === "OPTIONS") return json({});
  const path = new URL(request.url).pathname.replace(/^.*\/geo/, "") || "/";
  if (request.method === "GET" && path === "/health") {
    return json({ ok: true, routing: { ors: Boolean(deps.routing.orsApiKey), osrm: Boolean(deps.routing.osrmBaseUrl) }, cache: Boolean(deps.cache) });
  }
  if (request.method !== "POST") return error("METHOD_NOT_ALLOWED", "Use POST.", 405);
  const userId = await deps.verifyUser(request.headers.get("authorization"));
  if (!userId) return error("UNAUTHENTICATED", "Sign in to use the geo service.", 401);
  if (!deps.rateLimit(userId)) return error("RATE_LIMITED", "Too many geo requests. Please wait a minute.", 429);
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return error("INVALID_JSON", "Send valid JSON.", 400);
  }
  try {
    if (path === "/matrix") {
      const points = readPoints(body.points);
      if (typeof points === "string") return error("VALIDATION_ERROR", points, 400);
      return json(await cachedTravelMatrix(points, deps.routing, deps.cache));
    }
    if (path === "/route") {
      const points = readPoints(body.points);
      if (typeof points === "string") return error("VALIDATION_ERROR", points, 400);
      return json(await routeThrough(points, deps.routing));
    }
    if (path === "/geocode") {
      const query = typeof body.query === "string" ? body.query : "";
      const near = body.near ? checkCoordinates((body.near as LatLng).latitude, (body.near as LatLng).longitude) : null;
      return json(await geocode(query, near && near.valid ? near.point : null, {
        gazetteer: deps.gazetteer, nominatimBaseUrl: deps.nominatim.baseUrl, nominatimContactEmail: deps.nominatim.contactEmail, fetchFn: deps.routing.fetchFn,
      }));
    }
    if (path === "/optimize") {
      const problem = readProblem(body.problem);
      if (typeof problem === "string") return error("VALIDATION_ERROR", problem, 400);
      const result = solveItinerary(problem, { timeLimitMs: 1200 });
      const userOrder = Array.isArray(body.userOrder) ? (body.userOrder as unknown[]).filter((n): n is number => Number.isInteger(n)) : null;
      return json({ result, comparison: result.status === "ok" && userOrder ? compareOrders(problem, userOrder, result.best) : null });
    }
    return error("NOT_FOUND", "Unknown geo endpoint.", 404);
  } catch (failure) {
    const message = failure instanceof RangeError ? failure.message : "The geo service failed.";
    return error(failure instanceof RangeError ? "VALIDATION_ERROR" : "GEO_FAILED", message, failure instanceof RangeError ? 400 : 500);
  }
}
