import { describe, expect, it } from "vitest";
import { hexbin } from "@geo/hexbin.ts";
import { straightLineKm } from "@geo/distance.ts";

const origin = { latitude: 31.4181, longitude: 73.0791 };

describe("hexbin", () => {
  it("groups nearby points and separates distant ones", () => {
    const cells = hexbin([
      { latitude: 31.4181, longitude: 73.0791, name: "a" },
      { latitude: 31.4183, longitude: 73.0793, name: "b" },
      { latitude: 31.45, longitude: 73.12, name: "c" },
    ], 500, origin);
    expect(cells).toHaveLength(2);
    expect(cells.find((cell) => cell.items.length === 2)?.items.map((item) => item.name)).toEqual(["a", "b"]);
  });

  it("builds closed hexagons whose corners sit one size away from the centre", () => {
    const [cell] = hexbin([{ ...origin }], 500, origin);
    expect(cell.polygon).toHaveLength(7);
    expect(cell.polygon[0]).toEqual(cell.polygon[6]);
    for (const [longitude, latitude] of cell.polygon.slice(0, 6)) {
      expect(straightLineKm(cell.center, { latitude, longitude })).toBeCloseTo(0.5, 2);
    }
  });

  it("puts every point inside the cell it was assigned to", () => {
    const points = Array.from({ length: 200 }, (_, index) => ({ latitude: 31.38 + (index % 20) * 0.004, longitude: 73.04 + Math.floor(index / 20) * 0.006 }));
    for (const cell of hexbin(points, 400, origin)) {
      for (const point of cell.items) expect(straightLineKm(cell.center, point)).toBeLessThanOrEqual(0.401);
    }
  });

  it("rejects a non-positive size", () => {
    expect(() => hexbin([], 0, origin)).toThrow();
  });
});
