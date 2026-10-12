import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

// Trip defaults: efficiency, petrol price (with the date it was set) and objective weights.
// The official reference price is offered with its date but never applied silently.
export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const [preferences, price, vehicles, official] = await Promise.all([
    access.supabase.from("user_preferences").select("*").eq("user_id", access.profile.id).maybeSingle(),
    access.supabase.from("fuel_price_settings").select("price_pkr_per_litre,source,set_at").eq("user_id", access.profile.id).eq("fuel_type", "petrol").order("set_at", { ascending: false }).limit(1).maybeSingle(),
    access.supabase.from("driver_vehicles").select("id,nickname,fuel_type,estimated_km_per_litre").eq("user_id", access.profile.id).order("created_at"),
    access.supabase.from("fuel_prices").select("price_per_litre,source_name,effective_at,verified_at").eq("fuel_type", "petrol").eq("is_demo", false)
      .not("verified_at", "is", null).lte("effective_at", new Date().toISOString()).order("effective_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const failed = [preferences, price].find((result) => result.error);
  if (failed?.error) return dbError(failed.error, "trip_settings_failed");
  return apiReply({
    preferences: preferences.data,
    price: price.data,
    vehicles: vehicles.data ?? [],
    officialReference: official.error ? null : official.data,
  });
}

const update = z.object({
  kmPerLitre: z.number().gt(0).max(200).nullable().optional(),
  pricePkrPerLitre: z.number().gt(0).max(5000).optional(),
  priceSource: z.enum(["user", "official_reference"]).default("user"),
  timeWeightPkrPerMinute: z.number().min(0).max(1000).optional(),
  failedVisitPenaltyPkr: z.number().min(0).max(100_000).optional(),
  missedDeadlinePenaltyPkr: z.number().min(0).max(100_000).optional(),
  maxTripMinutes: z.number().int().min(10).max(1440).nullable().optional(),
  defaultVehicleId: z.uuid().nullable().optional(),
  dataSharingConsent: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = update.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const row: Record<string, unknown> = { user_id: access.profile.id, updated_at: new Date().toISOString() };
  if (input.kmPerLitre !== undefined) row.km_per_litre = input.kmPerLitre;
  if (input.timeWeightPkrPerMinute !== undefined) row.time_weight_pkr_per_minute = input.timeWeightPkrPerMinute;
  if (input.failedVisitPenaltyPkr !== undefined) row.failed_visit_penalty_pkr = input.failedVisitPenaltyPkr;
  if (input.missedDeadlinePenaltyPkr !== undefined) row.missed_deadline_penalty_pkr = input.missedDeadlinePenaltyPkr;
  if (input.maxTripMinutes !== undefined) row.max_trip_minutes = input.maxTripMinutes;
  if (input.defaultVehicleId !== undefined) row.default_vehicle_id = input.defaultVehicleId;
  if (input.dataSharingConsent !== undefined) Object.assign(row, { data_sharing_consent: input.dataSharingConsent, consented_at: input.dataSharingConsent ? new Date().toISOString() : null });
  const { error } = await access.supabase.from("user_preferences").upsert(row, { onConflict: "user_id" });
  if (error) return dbError(error, "trip_settings_save_failed");
  if (input.pricePkrPerLitre !== undefined) {
    const { error: priceError } = await access.supabase.from("fuel_price_settings").insert({ user_id: access.profile.id, fuel_type: "petrol", price_pkr_per_litre: input.pricePkrPerLitre, source: input.priceSource });
    if (priceError) return dbError(priceError, "trip_price_save_failed");
  }
  return apiReply({ ok: true });
}
