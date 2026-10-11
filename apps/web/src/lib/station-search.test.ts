import { describe, expect, it } from "vitest";
import { parseStationSearch, stationAreas } from "./station-search";

describe("station search validation", () => {
  it("supports manual search without location consent", () => {
    expect(parseStationSearch({ areaId: "susan-road" })).toEqual({ ...stationAreas["susan-road"], radiusKm: 15, fuelType: null });
  });
  it("accepts valid GPS and a known fuel", () => {
    expect(parseStationSearch({ lat: 31.4, lng: 73.1, fuelType: "diesel", radiusKm: 30 })).toEqual({ latitude: 31.4, longitude: 73.1, fuelType: "diesel", radiusKm: 30 });
  });
  it.each([
    {}, { areaId: "__proto__" }, { areaId: "toString" }, { areaId: "unknown" },
    { lat: "", lng: 73 }, { lat: 31 }, { lat: true, lng: 73 },
    { lat: null, lng: 73 }, { lat: 91, lng: 73 }, { lat: 31, lng: 181 },
    { lat: Infinity, lng: 73 }, { lat: "NaN", lng: 73 },
    { areaId: "city-centre", radiusKm: 31 }, { areaId: "city-centre", radiusKm: 0 },
    { areaId: "city-centre", radiusKm: "" }, { areaId: "city-centre", fuelType: "lpg" },
    { areaId: "city-centre", lat: "", lng: "" },
  ])("rejects invalid or ambiguous input %j", (input) => {
    expect(() => parseStationSearch(input)).toThrow();
  });
  it("does not confuse valid zero coordinates with missing input", () => {
    expect(parseStationSearch({ lat: 0, lng: 0 }).latitude).toBe(0);
  });
});
