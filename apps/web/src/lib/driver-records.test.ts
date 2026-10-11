import { describe, expect, it } from "vitest";
import {
  calculateMileage,
  isUuid,
  numberInput,
  validateVehicle,
  type MileageLog,
} from "./driver-records";
describe("Driver input validation", () => {
  it.each([
    null,
    undefined,
    true,
    false,
    "",
    " ",
    "not a number",
    Infinity,
    NaN,
    {},
  ])("rejects missing or nonnumeric values: %s", (value) => {
    expect(numberInput(value)).toBeNull();
  });
  it("retains zero and valid numeric strings", () => {
    expect(numberInput("0")).toBe(0);
    expect(numberInput("12.5")).toBe(12.5);
  });
  it("validates optional economy, nickname and supported types", () => {
    const vehicle = {
      nickname: "  City car  ",
      vehicleType: "car",
      fuelType: "petrol",
      estimatedKmPerLitre: "",
    };
    expect(validateVehicle(vehicle)).toEqual({
      nickname: "City car",
      vehicle_type: "car",
      fuel_type: "petrol",
      estimated_km_per_litre: null,
    });
    for (const estimatedKmPerLitre of [0, -1, 201, "bad", true])
      expect(validateVehicle({ ...vehicle, estimatedKmPerLitre })).toBeNull();
    expect(validateVehicle({ ...vehicle, nickname: " " })).toBeNull();
    expect(validateVehicle({ ...vehicle, vehicleType: "plane" })).toBeNull();
    expect(validateVehicle({ ...vehicle, fuelType: "electric" })).toBeNull();
  });
  it("requires UUID identifiers", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000001")).toBe(true);
    expect(isUuid("somebody else's vehicle")).toBe(false);
  });
});
describe("recorded mileage", () => {
  const log = (
    date: string,
    odo: number | null,
    litres = 10,
    vehicle: string | null = "a",
  ): MileageLog => ({
    logged_at: date,
    odometer_km: odo,
    litres,
    vehicle_id: vehicle,
  });
  it("requires comparable readings for a saved vehicle", () => {
    expect(calculateMileage([])).toBeNull();
    expect(calculateMileage([log("1", 100)])).toBeNull();
    expect(
      calculateMileage([log("1", 100, 10, null), log("2", 200, 10, null)]),
    ).toBeNull();
  });
  it("sorts records and excludes the fuel at the initial reading", () => {
    expect(calculateMileage([log("2", 200, 10), log("1", 100, 50)])).toBe(10);
  });
  it("includes refills between odometer readings", () => {
    expect(
      calculateMileage([log("1", 100), log("2", null, 5), log("3", 250, 10)]),
    ).toBe(10);
  });
  it("never mixes vehicle odometers", () => {
    expect(
      calculateMileage([log("1", 100, 10, "a"), log("2", 10000, 10, "b")]),
    ).toBeNull();
  });
  it("rejects backward and non-increasing intervals", () => {
    expect(calculateMileage([log("1", 200), log("2", 100)])).toBeNull();
    expect(calculateMileage([log("1", 100), log("2", 100)])).toBeNull();
  });
  it("weights valid vehicle intervals by fuel, not simple averages", () => {
    expect(
      calculateMileage([
        log("1", 100),
        log("2", 200, 10),
        log("1", 1000, 10, "b"),
        log("2", 1200, 10, "b"),
      ]),
    ).toBe(15);
  });
});
