// Fuel cost maths for itineraries. Units are explicit in every name.
//   fuel_litres    = distance_km / vehicle_efficiency_km_per_litre
//   fuel_cost_pkr  = fuel_litres * petrol_price_pkr_per_litre

export const MAX_KM_PER_LITRE = 200;
export const MAX_PRICE_PKR_PER_LITRE = 5000;

export type VehicleCostInput = { kmPerLitre: number; pricePkrPerLitre: number };

export type CostValidation = { valid: true } | { valid: false; field: "kmPerLitre" | "pricePkrPerLitre" | "distanceKm"; message: string };

export function validateCostInput(input: VehicleCostInput & { distanceKm?: number }): CostValidation {
  if (!Number.isFinite(input.kmPerLitre) || input.kmPerLitre <= 0 || input.kmPerLitre > MAX_KM_PER_LITRE) {
    return { valid: false, field: "kmPerLitre", message: `Fuel efficiency must be above 0 and at most ${MAX_KM_PER_LITRE} km per litre.` };
  }
  if (!Number.isFinite(input.pricePkrPerLitre) || input.pricePkrPerLitre <= 0 || input.pricePkrPerLitre > MAX_PRICE_PKR_PER_LITRE) {
    return { valid: false, field: "pricePkrPerLitre", message: `Petrol price must be above 0 and at most ${MAX_PRICE_PKR_PER_LITRE} PKR per litre.` };
  }
  if (input.distanceKm !== undefined && (!Number.isFinite(input.distanceKm) || input.distanceKm < 0)) {
    return { valid: false, field: "distanceKm", message: "Distance must be zero or more kilometres." };
  }
  return { valid: true };
}

export type FuelCost = { distanceKm: number; fuelLitres: number; fuelCostPkr: number };

export function fuelCost(distanceKm: number, vehicle: VehicleCostInput): FuelCost {
  const check = validateCostInput({ ...vehicle, distanceKm });
  if (!check.valid) throw new RangeError(check.message);
  const fuelLitres = distanceKm / vehicle.kmPerLitre;
  return { distanceKm, fuelLitres, fuelCostPkr: fuelLitres * vehicle.pricePkrPerLitre };
}

export function fuelCostPkrPerKm(vehicle: VehicleCostInput) {
  return fuelCost(1, vehicle).fuelCostPkr;
}

export type LegDistance = { distanceKm: number; estimate: "road" | "straight_line" };

export type TripCost = FuelCost & {
  legs: Array<FuelCost & { estimate: LegDistance["estimate"] }>;
  estimateKind: "road" | "straight_line" | "mixed" | "none";
  assumptions: string[];
};

// Multi-stop trip: sum of legs. A round trip is just a final leg back to the start.
export function tripFuelCost(legs: LegDistance[], vehicle: VehicleCostInput): TripCost {
  const costed = legs.map((leg) => ({ ...fuelCost(leg.distanceKm, vehicle), estimate: leg.estimate }));
  const total = costed.reduce((sum, leg) => ({
    distanceKm: sum.distanceKm + leg.distanceKm,
    fuelLitres: sum.fuelLitres + leg.fuelLitres,
    fuelCostPkr: sum.fuelCostPkr + leg.fuelCostPkr,
  }), { distanceKm: 0, fuelLitres: 0, fuelCostPkr: 0 });
  const kinds = new Set(legs.map((leg) => leg.estimate));
  const estimateKind = kinds.size === 0 ? "none" : kinds.size > 1 ? "mixed" : [...kinds][0];
  const assumptions = [
    `Fuel efficiency ${vehicle.kmPerLitre} km per litre, as entered.`,
    `Petrol price ${vehicle.pricePkrPerLitre} PKR per litre, as entered.`,
    "Fuel use is proportional to distance; traffic, idling and air-conditioning are not modelled.",
    ...(kinds.has("straight_line") ? ["Some distances are straight-line estimates, which are shorter than real roads."] : []),
  ];
  return { ...total, legs: costed, estimateKind, assumptions };
}

export type SensitivityRow = { label: string; kmPerLitre: number; pricePkrPerLitre: number; fuelCostPkr: number; changePkr: number };

// How the cost moves if efficiency or price is off by 10% or 20%.
export function costSensitivity(distanceKm: number, vehicle: VehicleCostInput): SensitivityRow[] {
  const base = fuelCost(distanceKm, vehicle).fuelCostPkr;
  const rows: SensitivityRow[] = [];
  for (const pct of [-20, -10, 10, 20]) {
    const kmPerLitre = vehicle.kmPerLitre * (1 + pct / 100);
    if (kmPerLitre > 0 && kmPerLitre <= MAX_KM_PER_LITRE) {
      const cost = fuelCost(distanceKm, { ...vehicle, kmPerLitre }).fuelCostPkr;
      rows.push({ label: `efficiency ${pct > 0 ? "+" : ""}${pct}%`, kmPerLitre, pricePkrPerLitre: vehicle.pricePkrPerLitre, fuelCostPkr: cost, changePkr: cost - base });
    }
  }
  for (const pct of [-10, 10]) {
    const pricePkrPerLitre = vehicle.pricePkrPerLitre * (1 + pct / 100);
    const cost = fuelCost(distanceKm, { ...vehicle, pricePkrPerLitre }).fuelCostPkr;
    rows.push({ label: `price ${pct > 0 ? "+" : ""}${pct}%`, kmPerLitre: vehicle.kmPerLitre, pricePkrPerLitre, fuelCostPkr: cost, changePkr: cost - base });
  }
  return rows;
}

// Estimated vs actual, when the driver records an odometer distance.
export function compareEstimateToActual(estimatedKm: number, actualKm: number, vehicle: VehicleCostInput) {
  const estimated = fuelCost(estimatedKm, vehicle);
  const actual = fuelCost(actualKm, vehicle);
  return {
    estimated,
    actual,
    differenceKm: actualKm - estimatedKm,
    differencePkr: actual.fuelCostPkr - estimated.fuelCostPkr,
    differencePct: estimatedKm > 0 ? ((actualKm - estimatedKm) / estimatedKm) * 100 : null,
  };
}

export const roundPkr = (value: number) => Math.round(value);
export const roundKm = (value: number) => Math.round(value * 10) / 10;
