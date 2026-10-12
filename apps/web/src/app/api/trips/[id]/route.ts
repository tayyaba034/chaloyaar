import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";
import { loadItinerary, reopenForChanges, runWorkflow, tripView } from "@/lib/trip-workflow/service";
import { WorkflowConflict } from "@/lib/trip-workflow/types";
import { canTransition } from "@/lib/trip-workflow/states";

type Params = { params: Promise<{ id: string }> };
const idOf = async (params: Params["params"]) => z.uuid().safeParse((await params).id);

export async function GET(_request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = await idOf(params);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid trip.", 400);
  const view = await tripView(access, id.data);
  if (!view.ok) return "notFound" in view ? apiError("NOT_FOUND", "That trip was not found.", 404) : dbError(view.error, "trip_view_failed");
  return apiReply(view);
}

// Answers to the planner's questions and trip settings. Changing them recomputes the plan.
const settings = z.object({
  origin: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), label: z.string().trim().max(160) }).optional(),
  kmPerLitre: z.number().gt(0).max(200).optional(),
  pricePkrPerLitre: z.number().gt(0).max(5000).optional(),
  departAt: z.iso.datetime({ offset: true }).optional(),
  returnToOrigin: z.boolean().optional(),
  maxTripMinutes: z.number().int().min(10).max(1440).nullable().optional(),
  preferredMaxCostPkr: z.number().gt(0).max(1_000_000).nullable().optional(),
  timeWeightPkrPerMinute: z.number().min(0).max(1000).optional(),
  failedVisitPenaltyPkr: z.number().min(0).max(100_000).optional(),
  keepUserOrder: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = await idOf(params);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid trip.", 400);
  const parsed = settings.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const loaded = await loadItinerary(access, id.data).catch((error) => ({ error }));
  if (!loaded) return apiError("NOT_FOUND", "That trip was not found.", 404);
  if ("error" in loaded) return dbError(loaded.error, "trip_load_failed");
  const { itinerary } = loaded;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.origin) Object.assign(update, { origin_label: input.origin.label, origin_latitude: Number(input.origin.latitude.toFixed(6)), origin_longitude: Number(input.origin.longitude.toFixed(6)) });
  if (input.kmPerLitre !== undefined) update.km_per_litre = input.kmPerLitre;
  if (input.pricePkrPerLitre !== undefined) update.price_pkr_per_litre = input.pricePkrPerLitre;
  if (input.departAt !== undefined) update.depart_at = input.departAt;
  if (input.returnToOrigin !== undefined) update.return_to_origin = input.returnToOrigin;
  if (input.maxTripMinutes !== undefined) update.max_trip_minutes = input.maxTripMinutes;
  if (input.preferredMaxCostPkr !== undefined) update.preferred_max_cost_pkr = input.preferredMaxCostPkr;
  const weights = { ...itinerary.weights };
  if (input.timeWeightPkrPerMinute !== undefined) weights.timeWeightPkrPerMinute = input.timeWeightPkrPerMinute;
  if (input.failedVisitPenaltyPkr !== undefined) weights.failedVisitPenaltyPkr = input.failedVisitPenaltyPkr;
  if (input.keepUserOrder !== undefined) weights.keepUserOrder = input.keepUserOrder;
  update.weights = weights;
  const { error } = await access.supabase.from("itineraries").update(update).eq("id", id.data);
  if (error) return dbError(error, "trip_settings_failed");
  // The petrol price the user typed is remembered with its date; it is never hardcoded.
  if (input.pricePkrPerLitre !== undefined) {
    await access.supabase.from("fuel_price_settings").insert({ user_id: access.profile.id, fuel_type: "petrol", price_pkr_per_litre: input.pricePkrPerLitre, source: "user" });
  }
  try {
    await reopenForChanges(access, { ...itinerary });
    const result = await runWorkflow(access, id.data, "user");
    return apiReply({ state: result.itinerary.workflowState });
  } catch (failure) {
    if (failure instanceof WorkflowConflict) return apiError("CONFLICT", failure.message, 409);
    return apiError("PLANNER_FAILED", "The planner could not finish. Press Retry.", 503);
  }
}

// Cancel a trip that has not been completed.
export async function DELETE(_request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = await idOf(params);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid trip.", 400);
  const loaded = await loadItinerary(access, id.data).catch(() => null);
  if (!loaded) return apiError("NOT_FOUND", "That trip was not found.", 404);
  if (!canTransition(loaded.itinerary.workflowState, "CANCELLED")) return apiError("RULE", "This trip can no longer be cancelled.", 409);
  const { error } = await access.supabase.from("itineraries").update({ workflow_state: "CANCELLED" }).eq("id", id.data);
  if (error) return dbError(error, "trip_cancel_failed");
  return apiReply({ state: "CANCELLED" });
}
