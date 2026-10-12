import { describe, expect, it, vi } from "vitest";
import { geocode } from "@geo/geocode.ts";

const gazetteer = vi.fn(async (query: string) => query.includes("ghanta")
  ? [{ id: "p1", nameEn: "Clock Tower", kind: "landmark", latitude: 31.4181, longitude: 73.0791 }]
  : []);

describe("geocoding", () => {
  it("accepts explicit coordinates without any provider", async () => {
    const result = await geocode("31.41, 73.08", null);
    expect(result.candidates).toEqual([{ latitude: 31.41, longitude: 73.08, label: "31.41000, 73.08000", source: "coordinates" }]);
  });

  it("uses the free gazetteer first", async () => {
    const result = await geocode("ghanta ghar", null, { gazetteer });
    expect(result.candidates[0]).toMatchObject({ label: "Clock Tower", source: "gazetteer", placeId: "p1" });
  });

  it("reports unconfigured providers instead of inventing results", async () => {
    const result = await geocode("unknown street", null, { gazetteer });
    expect(result.candidates).toEqual([]);
    expect(result.unavailable).toEqual([{ source: "nominatim", reason: "not_configured" }]);
  });

  it("calls Nominatim with a contact email and respects one request per second", async () => {
    let clock = 10_000;
    const fetchFn = vi.fn(async () => Response.json([{ lat: "31.40", lon: "73.10", display_name: "Somewhere, Faisalabad", type: "road" }]));
    const config = { gazetteer, nominatimBaseUrl: "https://nominatim.example", nominatimContactEmail: "ops@example.invalid", fetchFn, now: () => clock };
    const first = await geocode("unknown street", null, config);
    expect(first.candidates[0]).toMatchObject({ source: "nominatim", latitude: 31.4 });
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toContain("email=ops%40example.invalid");
    expect(url).toContain("countrycodes=pk");
    const second = await geocode("another street", null, config);
    expect(second.unavailable).toContainEqual({ source: "nominatim", reason: "rate_limited" });
    clock += 1500;
    expect((await geocode("third street", null, config)).candidates).toHaveLength(1);
  });

  it("survives provider errors", async () => {
    const result = await geocode("x street", null, { gazetteer: async () => { throw new Error("down"); } });
    expect(result.unavailable).toContainEqual({ source: "gazetteer", reason: "error" });
  });
});
