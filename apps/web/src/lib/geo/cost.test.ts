import { describe, expect, it } from "vitest";
import { compareEstimateToActual, costSensitivity, fuelCost, fuelCostPkrPerKm, tripFuelCost, validateCostInput } from "@geo/cost.ts";
import { straightLineKm } from "@geo/distance.ts";
import { checkCoordinates, parseCoordinateText } from "@geo/validate.ts";

const car = { kmPerLitre: 12.5, pricePkrPerLitre: 250 };

describe("fuel cost formula", () => {
  it("uses fuel_litres = km / km_per_litre and cost = litres × price", () => {
    expect(fuelCost(25, car)).toEqual({ distanceKm: 25, fuelLitres: 2, fuelCostPkr: 500 });
    expect(fuelCostPkrPerKm(car)).toBe(20);
  });

  it("returns zero for a zero distance", () => {
    expect(fuelCost(0, car)).toEqual({ distanceKm: 0, fuelLitres: 0, fuelCostPkr: 0 });
    expect(tripFuelCost([], car)).toMatchObject({ distanceKm: 0, fuelCostPkr: 0, estimateKind: "none" });
  });

  it("rejects invalid mileage", () => {
    for (const kmPerLitre of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 201]) {
      expect(() => fuelCost(10, { ...car, kmPerLitre })).toThrow(/efficiency/);
    }
    expect(validateCostInput({ ...car, kmPerLitre: 0 })).toMatchObject({ valid: false, field: "kmPerLitre" });
  });

  it("rejects invalid fuel prices", () => {
    for (const pricePkrPerLitre of [0, -1, Number.NaN, 5001]) {
      expect(() => fuelCost(10, { ...car, pricePkrPerLitre })).toThrow(/price/);
    }
    expect(validateCostInput({ ...car, pricePkrPerLitre: -1 })).toMatchObject({ valid: false, field: "pricePkrPerLitre" });
  });

  it("rejects negative or non-finite distances", () => {
    expect(() => fuelCost(-1, car)).toThrow(/Distance/);
    expect(() => fuelCost(Number.NaN, car)).toThrow(/Distance/);
  });

  it("sums multi-stop legs and labels mixed estimates", () => {
    const trip = tripFuelCost([
      { distanceKm: 5, estimate: "road" },
      { distanceKm: 7.5, estimate: "road" },
      { distanceKm: 12.5, estimate: "straight_line" },
    ], car);
    expect(trip.distanceKm).toBe(25);
    expect(trip.fuelLitres).toBe(2);
    expect(trip.fuelCostPkr).toBe(500);
    expect(trip.legs.map((leg) => leg.fuelCostPkr)).toEqual([100, 150, 250]);
    expect(trip.estimateKind).toBe("mixed");
    expect(trip.assumptions.join(" ")).toMatch(/straight-line/);
  });

  it("handles a round trip as a final leg back to the start", () => {
    const outAndBack = tripFuelCost([{ distanceKm: 6, estimate: "road" }, { distanceKm: 6, estimate: "road" }], car);
    expect(outAndBack.fuelCostPkr).toBe(240);
    expect(outAndBack.estimateKind).toBe("road");
  });

  it("shows sensitivity to efficiency and price", () => {
    const rows = costSensitivity(25, car);
    expect(rows.find((row) => row.label === "price +10%")?.changePkr).toBeCloseTo(50);
    expect(rows.find((row) => row.label === "efficiency -20%")?.fuelCostPkr).toBeCloseTo(625);
  });

  it("compares estimated and actual distance", () => {
    expect(compareEstimateToActual(10, 12, car)).toMatchObject({ differenceKm: 2, differencePkr: 40, differencePct: 20 });
    expect(compareEstimateToActual(0, 3, car).differencePct).toBeNull();
  });
});

describe("coordinates and straight-line distance", () => {
  it("validates latitude and longitude", () => {
    expect(checkCoordinates(31.418, 73.079)).toMatchObject({ valid: true, warnings: [] });
    expect(checkCoordinates("31.5", "74.3")).toMatchObject({ valid: true, warnings: ["outside_pilot_area"] });
    expect(checkCoordinates(91, 0)).toMatchObject({ valid: false });
    expect(checkCoordinates(0, 181)).toMatchObject({ valid: false });
    expect(checkCoordinates("abc", 0)).toMatchObject({ valid: false });
    expect(checkCoordinates(null, 0)).toMatchObject({ valid: false });
  });

  it("parses typed coordinates", () => {
    expect(parseCoordinateText("31.418, 73.079")).toEqual({ latitude: 31.418, longitude: 73.079 });
    expect(parseCoordinateText("31.418 73.079")).toEqual({ latitude: 31.418, longitude: 73.079 });
    expect(parseCoordinateText("Susan Road")).toBeNull();
    expect(parseCoordinateText("95, 73")).toBeNull();
  });

  it("computes great-circle distance", () => {
    expect(straightLineKm({ latitude: 31.4181, longitude: 73.0791 }, { latitude: 31.4181, longitude: 73.0791 })).toBe(0);
    // Clock Tower to D-Ground is roughly 3.2 km in a straight line.
    expect(straightLineKm({ latitude: 31.4181, longitude: 73.0791 }, { latitude: 31.4093, longitude: 73.112 })).toBeCloseTo(3.27, 1);
  });
});
