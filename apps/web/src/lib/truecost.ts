export type Point = { latitude: number; longitude: number };

export function distanceKm(first: Point, second: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(first.latitude);
  const lat2 = radians(second.latitude);
  const dLat = lat2 - lat1;
  const dLon = radians(second.longitude - first.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateEstimate(input: {
  directDistanceKm: number;
  viaStationDistanceKm: number;
  litres: number;
  pricePerLitre: number;
  kmPerLitre: number | null;
}) {
  const detourKm = Math.max(0, input.viaStationDistanceKm - input.directDistanceKm);
  const purchaseCost = input.litres * input.pricePerLitre;
  const detourFuelLitres = input.kmPerLitre && input.kmPerLitre > 0
    ? detourKm / input.kmPerLitre
    : null;
  const detourFuelCost = detourFuelLitres === null
    ? null
    : detourFuelLitres * input.pricePerLitre;
  return {
    detourKm,
    purchaseCost,
    detourFuelLitres,
    detourFuelCost,
    totalCost: detourFuelCost === null ? null : purchaseCost + detourFuelCost,
  };
}
