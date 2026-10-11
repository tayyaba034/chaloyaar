import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDrivingRoute } from "./routing";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OSRM_BASE_URL;
  delete process.env.OPENROUTESERVICE_API_KEY;
});

describe("routing providers", () => {
  it("uses OSRM without an API key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "Ok",
      routes: [{ distance: 12345, duration: 600 }],
    }), { status: 200 })));
    await expect(getDrivingRoute(
      { latitude: 31.4, longitude: 73.0 },
      { latitude: 31.5, longitude: 73.1 },
    )).resolves.toEqual({
      distanceKm: 12.345,
      durationMinutes: 10,
      source: "osrm",
    });
  });

  it("falls back to OpenRouteService when OSRM fails", async () => {
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        routes: [{ summary: { distance: 20000, duration: 900 } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getDrivingRoute(
      { latitude: 31.4, longitude: 73.0 },
      { latitude: 31.5, longitude: 73.1 },
    )).resolves.toEqual({
      distanceKm: 20,
      durationMinutes: 15,
      source: "openrouteservice",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no provider can route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(getDrivingRoute(
      { latitude: 31.4, longitude: 73.0 },
      { latitude: 31.5, longitude: 73.1 },
    )).resolves.toBeNull();
  });
});
