import { describe, expect, it } from "vitest";
import { mapStyleChain } from "./map-style";

describe("map style chain", () => {
  it("prefers a configured MapTiler key, then keyless OpenFreeMap, then OSM raster", () => {
    expect(mapStyleChain("abc").map((option) => option.id)).toEqual(["maptiler", "openfreemap", "osm"]);
    expect(mapStyleChain("a b")[0].style).toContain("key=a%20b");
  });

  it("starts with OpenFreeMap when no key is set", () => {
    expect(mapStyleChain("").map((option) => option.id)).toEqual(["openfreemap", "osm"]);
  });
});
