import { describe, expect, it, vi } from "vitest";
import { handleGeoRequest, type GeoDeps } from "../../../../../supabase/functions/geo/handler.ts";
import { cachedTravelMatrix, type RouteCache } from "@geo/route-cache.ts";

const deps = (patch: Partial<GeoDeps> = {}): GeoDeps => ({
  verifyUser: async (authorization) => (authorization === "Bearer good" ? "user-1" : null),
  routing: {},
  cache: null,
  gazetteer: null,
  nominatim: { baseUrl: null, contactEmail: null },
  rateLimit: () => true,
  ...patch,
});
const post = (path: string, body: unknown, token = "good") => new Request(`https://x.supabase.co/functions/v1/geo${path}`, {
  method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
});
const points = [{ latitude: 31.4181, longitude: 73.0791 }, { latitude: 31.4093, longitude: 73.112 }];

describe("geo edge function handler", () => {
  it("reports health without auth", async () => {
    const response = await handleGeoRequest(new Request("https://x/functions/v1/geo/health"), deps({ routing: { orsApiKey: "k" } }));
    expect(await response.json()).toEqual({ ok: true, routing: { ors: true, osrm: false }, cache: false });
  });

  it("requires a signed-in user and respects the rate limit", async () => {
    expect((await handleGeoRequest(post("/matrix", { points }, "bad"), deps())).status).toBe(401);
    expect((await handleGeoRequest(post("/matrix", { points }), deps({ rateLimit: () => false }))).status).toBe(429);
  });

  it("validates coordinates", async () => {
    const response = await handleGeoRequest(post("/matrix", { points: [{ latitude: 95, longitude: 0 }] }), deps());
    expect(response.status).toBe(400);
  });

  it("returns a labelled straight-line matrix when no routing is configured", async () => {
    const body = await (await handleGeoRequest(post("/matrix", { points }), deps())).json();
    expect(body.estimateKind).toBe("straight_line");
    expect(body.cells[0][1].source).toBe("straight_line");
  });

  it("optimises and compares with the user's order", async () => {
    const problem = {
      stops: ["a", "b"].map((id) => ({ id, label: id, mandatory: true, serviceMinutes: 0, windows: null, hardDeadlineMin: null, softDeadlineMin: null, failedVisitPenaltyPkr: 0, skipPenaltyPkr: 0 })),
      distanceKm: [[0, 1, 2], [1, 0, 1], [2, 1, 0]], durationMin: [[0, 3, 6], [3, 0, 3], [6, 3, 0]],
      returnToOrigin: false, maxTripMinutes: null, weights: { fuelCostPkrPerKm: 20, timeWeightPkrPerMinute: 1, missedDeadlinePenaltyPkr: 0 },
    };
    const body = await (await handleGeoRequest(post("/optimize", { problem, userOrder: [2, 1] }), deps())).json();
    expect(body.result.status).toBe("ok");
    expect(body.result.best.order).toEqual(["a", "b"]);
    expect(body.comparison.savingsKm).toBe(1);
  });
});

describe("route cache", () => {
  it("serves fully cached road cells and stores new road cells only", async () => {
    const store = new Map<string, { distanceKm: number; durationMin: number; source: "ors" }>();
    const cache: RouteCache = {
      get: async (pairs) => new Map(pairs.flatMap((pair) => store.has(`${pair.fromKey}|${pair.toKey}`) ? [[`${pair.fromKey}|${pair.toKey}`, store.get(`${pair.fromKey}|${pair.toKey}`)!]] : [])),
      put: async (entries) => { entries.forEach((entry) => store.set(`${entry.fromKey}|${entry.toKey}`, entry.cell as never)); },
    };
    const fetchFn = vi.fn(async () => Response.json({ distances: [[0, 4], [4, 0]], durations: [[0, 600], [600, 0]] }));
    const first = await cachedTravelMatrix(points, { orsApiKey: "k", fetchFn }, cache);
    expect(first.cacheHit).toBe(false);
    expect(store.size).toBe(2);
    const second = await cachedTravelMatrix(points, { orsApiKey: "k", fetchFn }, cache);
    expect(second.cacheHit).toBe(true);
    expect(second.cells[0][1].distanceKm).toBe(4);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const straight = await cachedTravelMatrix(points, {}, { get: async () => new Map(), put: vi.fn(async () => undefined) });
    expect(straight.estimateKind).toBe("straight_line");
  });
});
