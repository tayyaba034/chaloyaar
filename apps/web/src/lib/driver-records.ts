export type DriverVehicle = {
  id: string;
  nickname: string;
  vehicle_type: string;
  fuel_type: string;
  estimated_km_per_litre: number | null;
};
export function numberInput(value: unknown): number | null {
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function validateVehicle(payload: Record<string, unknown>) {
  const nickname =
    typeof payload.nickname === "string" ? payload.nickname.trim() : "";
  const economy =
    payload.estimatedKmPerLitre === "" || payload.estimatedKmPerLitre == null
      ? null
      : numberInput(payload.estimatedKmPerLitre);
  if (
    !nickname ||
    nickname.length > 60 ||
    !["car", "motorcycle", "van", "truck"].includes(
      String(payload.vehicleType),
    ) ||
    !["petrol", "diesel", "cng"].includes(String(payload.fuelType))
  )
    return null;
  if (
    payload.estimatedKmPerLitre != null &&
    payload.estimatedKmPerLitre !== "" &&
    (economy === null || economy <= 0 || economy > 200)
  )
    return null;
  return {
    nickname,
    vehicle_type: String(payload.vehicleType),
    fuel_type: String(payload.fuelType),
    estimated_km_per_litre: economy,
  };
}
export type MileageLog = {
  vehicle_id: string | null;
  litres: number;
  odometer_km: number | null;
  logged_at: string;
};
// Refuelling at the first reading precedes the measured interval; exclude it.
export function calculateMileage(logs: MileageLog[]) {
  const groups = new Map<string, MileageLog[]>();
  for (const log of logs)
    if (log.vehicle_id)
      groups.set(log.vehicle_id, [...(groups.get(log.vehicle_id) ?? []), log]);
  let distance = 0,
    litres = 0;
  for (const records of groups.values()) {
    records.sort((a, b) => a.logged_at.localeCompare(b.logged_at));
    const first = records.findIndex((log) => log.odometer_km !== null);
    const last = records.findLastIndex((log) => log.odometer_km !== null);
    if (first < 0 || last <= first) continue;
    const readings = records
      .slice(first, last + 1)
      .filter((log) => log.odometer_km !== null);
    if (
      readings.some(
        (log, i) => i > 0 && log.odometer_km! < readings[i - 1].odometer_km!,
      )
    )
      continue;
    const km = readings.at(-1)!.odometer_km! - readings[0].odometer_km!;
    const fuel = records
      .slice(first + 1, last + 1)
      .reduce((sum, log) => sum + log.litres, 0);
    if (km > 0 && fuel > 0) {
      distance += km;
      litres += fuel;
    }
  }
  return litres > 0 ? distance / litres : null;
}
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
