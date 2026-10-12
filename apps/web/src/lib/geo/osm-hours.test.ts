import { describe, expect, it } from "vitest";
import { parseOsmOpeningHours } from "@geo/osm-hours.ts";

describe("OSM opening hours", () => {
  it("parses day ranges and closed days", () => {
    const rows = parseOsmOpeningHours("Mo-Sa 09:00-21:00; Su off")!;
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.weekday === 1)).toEqual({ weekday: 1, opensAt: "09:00", closesAt: "21:00", closesNextDay: false });
    expect(rows.some((row) => row.weekday === 0)).toBe(false);
  });

  it("handles split shifts, lists and overnight hours", () => {
    expect(parseOsmOpeningHours("Mo-Fr 10:00-14:00,17:00-21:00")).toHaveLength(10);
    expect(parseOsmOpeningHours("Fr,Sa 20:00-02:00")).toEqual([
      { weekday: 5, opensAt: "20:00", closesAt: "02:00", closesNextDay: true },
      { weekday: 6, opensAt: "20:00", closesAt: "02:00", closesNextDay: true },
    ]);
    expect(parseOsmOpeningHours("Mo-Su 08:00-24:00")?.[0]).toMatchObject({ closesAt: "00:00", closesNextDay: true });
    expect(parseOsmOpeningHours("24/7")).toHaveLength(7);
  });

  it("wraps day ranges across Sunday", () => {
    expect(parseOsmOpeningHours("Sa-Mo 10:00-12:00")?.map((row) => row.weekday)).toEqual([6, 0, 1]);
  });

  it("returns null for formats it does not understand", () => {
    expect(parseOsmOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOsmOpeningHours("Mo-Fr 09:00-17:00; PH off")).toBeNull();
    expect(parseOsmOpeningHours("")).toBeNull();
    expect(parseOsmOpeningHours(undefined)).toBeNull();
  });
});
