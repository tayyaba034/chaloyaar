import { describe, expect, it } from "vitest";
import { calculateEstimate, distanceKm } from "./truecost";

describe("truecost calculations", () => {
  it("calculates detour fuel and total cost", () => {
    expect(calculateEstimate({
      directDistanceKm: 10,
      viaStationDistanceKm: 14,
      litres: 20,
      pricePerLitre: 280,
      kmPerLitre: 10,
    })).toEqual({
      detourKm: 4,
      purchaseCost: 5600,
      detourFuelLitres: 0.4,
      detourFuelCost: 112,
      totalCost: 5712,
    });
  });

  it("returns a partial estimate without fuel economy", () => {
    expect(calculateEstimate({
      directDistanceKm: 10,
      viaStationDistanceKm: 14,
      litres: 20,
      pricePerLitre: 280,
      kmPerLitre: null,
    }).totalCost).toBeNull();
  });

  it("never reports a negative detour", () => {
    expect(calculateEstimate({
      directDistanceKm: 10,
      viaStationDistanceKm: 8,
      litres: 1,
      pricePerLitre: 1,
      kmPerLitre: 10,
    }).detourKm).toBe(0);
  });

  it("measures nearby points in kilometres", () => {
    expect(distanceKm({ latitude: 31.4181, longitude: 73.0791 }, { latitude: 31.4181, longitude: 73.0912 }))
      .toBeCloseTo(1.15, 1);
  });
});
