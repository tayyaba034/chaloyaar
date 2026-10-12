import { requireApiUser } from "@/lib/api-auth";
import { apiReply } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

// Trip history and the monthly summary. Savings count only "avoided" outcomes the user confirmed,
// each backed by a business update or declined request (enforced in the database).
export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const [summary, trips, outcomes] = await Promise.all([
    access.supabase.from("monthly_trip_summary").select("*").eq("user_id", access.profile.id).order("month", { ascending: false }).limit(12),
    access.supabase.from("trips").select("id,itinerary_id,status,started_at,ended_at,planned_distance_km,planned_estimate_kind,actual_distance_km,estimated_fuel_litres,estimated_fuel_cost_pkr,actual_fuel_cost_pkr,km_per_litre_snapshot,price_pkr_per_litre_snapshot,is_demo,created_at,itineraries(title)")
      .eq("user_id", access.profile.id).order("created_at", { ascending: false }).limit(30),
    access.supabase.from("trip_outcomes").select("outcome,failure_cause,avoided_round_trip_km,avoided_estimate_kind,avoided_fuel_cost_pkr,km_per_litre_snapshot,price_pkr_per_litre_snapshot,recorded_at,itinerary_stops(errand_label,place_label)")
      .order("recorded_at", { ascending: false }).limit(100),
  ]);
  const failed = [summary, trips, outcomes].find((result) => result.error);
  if (failed?.error) return dbError(failed.error, "trip_history_failed");
  const failureCauses: Record<string, number> = {};
  for (const row of outcomes.data ?? []) if (row.outcome === "failed" && row.failure_cause) failureCauses[row.failure_cause] = (failureCauses[row.failure_cause] ?? 0) + 1;
  return apiReply({
    months: summary.data ?? [],
    trips: trips.data ?? [],
    avoided: (outcomes.data ?? []).filter((row) => row.outcome === "avoided"),
    failureCauses,
  });
}
