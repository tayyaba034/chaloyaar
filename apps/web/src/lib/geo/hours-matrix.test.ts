import { describe, expect, it, vi } from "vitest";
import { clockLabel, intersectWindows, windowsForTrip } from "@geo/hours.ts";
import { buildTravelMatrix, routeThrough } from "@geo/matrix.ts";

// Monday 12 Oct 2026, 10:00 in Faisalabad (05:00 UTC).
const departAt = new Date("2026-10-12T05:00:00Z");

describe("opening hours to trip windows", () => {
  it("returns null when hours are unknown, [] when closed all day", () => {
    expect(windowsForTrip([], departAt)).toBeNull();
    expect(windowsForTrip([{ weekday: 1, opensAt: "09:00", closesAt: "17:00", isClosed: true }], departAt, 600)).toEqual([]);
  });

  it("converts local hours into minutes after departure", () => {
    const windows = windowsForTrip([{ weekday: 1, opensAt: "09:00", closesAt: "13:00" }, { weekday: 1, opensAt: "14:00", closesAt: "18:00" }], departAt, 600);
    expect(windows).toEqual([{ startMin: 0, endMin: 180 }, { startMin: 240, endMin: 480 }]);
    expect(clockLabel(departAt, 240)).toBe("14:00");
  });

  it("handles overnight hours that started the previous day", () => {
    const late = new Date("2026-10-12T19:30:00Z"); // 00:30 local on Tuesday
    const windows = windowsForTrip([{ weekday: 1, opensAt: "20:00", closesAt: "02:00" }], late, 240);
    expect(windows).toEqual([{ startMin: 0, endMin: 90 }]);
  });

  it("lets a date exception override the weekday", () => {
    const rows = [
      { weekday: 1, opensAt: "09:00", closesAt: "21:00" },
      { weekday: 1, opensAt: "00:00", closesAt: "00:00", isClosed: true, validOn: "2026-10-12" },
    ];
    expect(windowsForTrip(rows, departAt, 600)).toEqual([]);
  });

  it("intersects published hours with an appointment slot", () => {
    expect(intersectWindows([{ startMin: 0, endMin: 180 }], [{ startMin: 60, endMin: 240 }])).toEqual([{ startMin: 60, endMin: 180 }]);
    expect(intersectWindows(null, [{ startMin: 30, endMin: 60 }])).toEqual([{ startMin: 30, endMin: 60 }]);
    expect(intersectWindows(null, null)).toBeNull();
  });
});

const points = [
  { latitude: 31.4181, longitude: 73.0791 },
  { latitude: 31.4093, longitude: 73.112 },
  { latitude: 31.4077, longitude: 73.0912 },
];

describe("travel matrix adapters", () => {
  it("labels straight-line estimates when no routing is configured", async () => {
    const matrix = await buildTravelMatrix(points);
    expect(matrix.estimateKind).toBe("straight_line");
    expect(matrix.notes).toEqual(expect.arrayContaining(["road_routing_not_configured", "straight_line_speed_assumption_25_kmh"]));
    expect(matrix.cells[0][1].source).toBe("straight_line");
    expect(matrix.cells[0][1].durationMin).toBeCloseTo((matrix.cells[0][1].distanceKm / 25) * 60);
  });

  it("uses ORS road distances and falls back per missing cell", async () => {
    const fetchFn = vi.fn(async () => Response.json({
      distances: [[0, 4.1, 2.2], [4.0, 0, null], [2.3, 2.9, 0]],
      durations: [[0, 600, 300], [590, 0, null], [310, 420, 0]],
    }));
    const matrix = await buildTravelMatrix(points, { orsApiKey: "key", fetchFn });
    expect(matrix.cells[0][1]).toEqual({ distanceKm: 4.1, durationMin: 10, source: "ors" });
    expect(matrix.cells[1][2].source).toBe("straight_line");
    expect(matrix.estimateKind).toBe("mixed");
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("key");
  });

  it("tries OSRM when ORS fails and records why", async () => {
    const fetchFn = vi.fn(async (url: string) => url.includes("openrouteservice")
      ? new Response("quota", { status: 429 })
      : Response.json({ code: "Ok", distances: [[0, 4100, 2200], [4000, 0, 3000], [2300, 2900, 0]], durations: [[0, 600, 300], [590, 0, 400], [310, 420, 0]] }));
    const matrix = await buildTravelMatrix(points, { orsApiKey: "key", osrmBaseUrl: "https://osrm.example", fetchFn });
    expect(matrix.estimateKind).toBe("road");
    expect(matrix.providers).toEqual(["osrm"]);
    expect(matrix.notes).toContain("openrouteservice_unavailable");
    expect(matrix.cells[0][1].distanceKm).toBeCloseTo(4.1);
  });

  it("falls back to straight lines for route geometry when providers fail", async () => {
    const route = await routeThrough(points, { osrmBaseUrl: "https://osrm.example", fetchFn: async () => new Response("down", { status: 503 }) });
    expect(route.source).toBe("straight_line");
    expect(route.legs).toHaveLength(2);
    expect(route.geometry?.coordinates).toHaveLength(3);
  });

  it("rejects too many points", async () => {
    await expect(buildTravelMatrix(Array.from({ length: 26 }, () => points[0]))).rejects.toThrow(/At most 25/);
  });
});
