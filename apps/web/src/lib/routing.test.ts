import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { getDrivingRoute } from "./routing";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.OSRM_BASE_URL;
  delete process.env.OPENROUTESERVICE_API_KEY;
});

describe("routing providers", () => {
  it("pins via routes to the base provider without crossing to a different service", async () => {
    process.env.OSRM_BASE_URL = "https://routing.example.test";
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response("failed", {status:503}));
    vi.stubGlobal("fetch",fetchMock);
    expect(await getDrivingRoute({latitude:31,longitude:73},{latitude:32,longitude:74},{latitude:31.5,longitude:73.5},"osrm")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("uses configured OSRM without an API key", async () => {
    process.env.OSRM_BASE_URL = "https://routing.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "Ok",
            routes: [{ distance: 12345, duration: 600 }],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      getDrivingRoute(
        { latitude: 31.4, longitude: 73.0 },
        { latitude: 31.5, longitude: 73.1 },
      ),
    ).resolves.toEqual({
      distanceKm: 12.345,
      durationMinutes: 10,
      source: "osrm",
    });
  });

  it("falls back to OpenRouteService when OSRM fails", async () => {
    process.env.OSRM_BASE_URL = "https://routing.example.test";
    process.env.OPENROUTESERVICE_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            routes: [{ summary: { distance: 20000, duration: 900 } }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getDrivingRoute(
        { latitude: 31.4, longitude: 73.0 },
        { latitude: 31.5, longitude: 73.1 },
      ),
    ).resolves.toEqual({
      distanceKm: 20,
      durationMinutes: 15,
      source: "openrouteservice",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns null when no provider can route", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(
      getDrivingRoute(
        { latitude: 31.4, longitude: 73.0 },
        { latitude: 31.5, longitude: 73.1 },
      ),
    ).resolves.toBeNull();
  });
  it("does not call a public demo routing service without configuration", async () => {
    delete process.env.OSRM_BASE_URL;
    delete process.env.OPENROUTESERVICE_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await getDrivingRoute(
        { latitude: 31, longitude: 73 },
        { latitude: 32, longitude: 74 },
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("routes through the station and returns actual road geometry", async () => {
    process.env.OSRM_BASE_URL = "https://routing.example.test";
    const geometry = {
      type: "LineString",
      coordinates: [
        [73, 31],
        [73.5, 31.5],
        [74, 32],
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "Ok",
            routes: [{ distance: 12000, duration: 900, geometry }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await getDrivingRoute(
      { latitude: 31, longitude: 73 },
      { latitude: 32, longitude: 74 },
      { latitude: 31.5, longitude: 73.5 },
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "73,31;73.5,31.5;74,32",
    );
    expect(result?.geometry).toEqual(geometry);
  });
});
