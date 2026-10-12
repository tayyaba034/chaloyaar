import { buildTravelMatrix, type MatrixCell, type RoutingConfig, type TravelMatrix } from "./matrix.ts";
import type { LatLng } from "./types.ts";

// Optional cache for road distances (public.route_estimates). Straight-line cells are never cached.
export type RouteCache = {
  get(pairs: Array<{ fromKey: string; toKey: string }>): Promise<Map<string, MatrixCell>>;
  put(entries: Array<{ fromKey: string; toKey: string; cell: MatrixCell }>): Promise<void>;
};

export const pointKey = (point: LatLng) => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

/** Uses cached road cells when every pair is cached; otherwise asks the provider and stores new road cells. */
export async function cachedTravelMatrix(points: LatLng[], config: RoutingConfig, cache: RouteCache | null): Promise<TravelMatrix & { cacheHit: boolean }> {
  const keys = points.map(pointKey);
  const pairs = keys.flatMap((fromKey, i) => keys.flatMap((toKey, j) => (i === j ? [] : [{ fromKey, toKey }])));
  if (cache && pairs.length) {
    const cached = await cache.get(pairs).catch(() => new Map<string, MatrixCell>());
    if (pairs.every((pair) => cached.has(`${pair.fromKey}|${pair.toKey}`))) {
      const cells = keys.map((from, i) => keys.map((to, j) => (i === j ? { distanceKm: 0, durationMin: 0, source: cached.values().next().value!.source } : cached.get(`${from}|${to}`)!)));
      const providers = [...new Set(pairs.map((pair) => cached.get(`${pair.fromKey}|${pair.toKey}`)!.source))];
      return { cells, estimateKind: "road", providers, notes: ["cached_road_estimates"], cacheHit: true };
    }
  }
  const matrix = await buildTravelMatrix(points, config);
  if (cache) {
    const entries = keys.flatMap((fromKey, i) => keys.flatMap((toKey, j) => {
      const cell = matrix.cells[i][j];
      return i !== j && cell.source !== "straight_line" ? [{ fromKey, toKey, cell }] : [];
    }));
    if (entries.length) await cache.put(entries).catch(() => undefined);
  }
  return { ...matrix, cacheHit: false };
}
