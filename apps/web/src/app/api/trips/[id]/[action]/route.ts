import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";
import { businessCategories } from "@/lib/businesses";
import { decideAction, loadItinerary, reopenForChanges, runWorkflow } from "@/lib/trip-workflow/service";
import { WorkflowConflict } from "@/lib/trip-workflow/types";

type Params = { params: Promise<{ id: string; action: string }> };

const stopOps = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"), label: z.string().trim().min(1).max(120), category: z.enum(businessCategories).nullable().optional(),
    serviceQuery: z.string().trim().max(120).optional(), businessId: z.uuid().optional(),
    place: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), label: z.string().trim().max(160) }).optional(),
    mandatory: z.boolean().default(true),
  }),
  z.object({ op: z.literal("remove"), stopId: z.uuid() }),
  z.object({ op: z.literal("reorder"), stopIds: z.array(z.uuid()).min(1).max(25) }),
  z.object({
    op: z.literal("edit"), stopId: z.uuid(),
    mandatory: z.boolean().optional(),
    deadlineAt: z.iso.datetime({ offset: true }).nullable().optional(),
    deadlineKind: z.enum(["hard", "soft"]).optional(),
    preferredFrom: z.iso.datetime({ offset: true }).nullable().optional(),
    preferredTo: z.iso.datetime({ offset: true }).nullable().optional(),
    serviceMinutes: z.number().int().min(0).max(480).optional(),
    businessId: z.uuid().optional(),
  }),
]);
const decision = z.object({ actionId: z.uuid(), decision: z.enum(["approve", "reject"]), acknowledgeRisk: z.boolean().optional() });
const appointment = z.object({ stopId: z.uuid(), windowStart: z.iso.datetime({ offset: true }), windowEnd: z.iso.datetime({ offset: true }), note: z.string().trim().max(300).optional() });

export async function POST(request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { id: rawId, action } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid trip.", 400);
  const body = await readJson(request);
  const loaded = await loadItinerary(access, id.data).catch((error) => ({ error }));
  if (!loaded) return apiError("NOT_FOUND", "That trip was not found.", 404);
  if ("error" in loaded) return dbError(loaded.error, "trip_load_failed");

  try {
    if (action === "decide") {
      const parsed = decision.safeParse(body);
      if (!parsed.success) return validationError(parsed.error);
      const result = await decideAction(access, id.data, parsed.data.actionId, parsed.data);
      if (!result.ok) return "error" in result ? dbError(result.error!, "trip_action_failed") : apiError("RULE", result.message, result.status);
      return apiReply(result.result);
    }
    if (action === "recalculate" || action === "retry") {
      await reopenForChanges(access, loaded.itinerary);
      const result = await runWorkflow(access, id.data, "user");
      return apiReply({ state: result.itinerary.workflowState });
    }
    if (action === "appointment") {
      // Proposes an appointment request; it is only sent after the user approves it.
      const parsed = appointment.safeParse(body);
      if (!parsed.success) return validationError(parsed.error);
      const stop = loaded.stops.find((item) => item.id === parsed.data.stopId);
      if (!stop?.businessId) return apiError("RULE", "Choose a stop with a business first.", 409);
      const { error } = await access.supabase.from("pending_actions").insert({
        itinerary_id: id.data, user_id: access.profile.id, action_type: "request_appointment", proposed_by: "user",
        summary: `Request an appointment at ${stop.placeLabel}`.slice(0, 300),
        payload: { businessId: stop.businessId, serviceId: stop.serviceId, stopId: stop.id, windowStart: parsed.data.windowStart, windowEnd: parsed.data.windowEnd, note: parsed.data.note ?? null },
      });
      if (error) return dbError(error, "trip_appointment_failed");
      return apiReply({ proposed: true }, 201);
    }
    if (action === "stops") {
      const parsed = stopOps.safeParse(body);
      if (!parsed.success) return validationError(parsed.error);
      const input = parsed.data;
      const { stops } = loaded;
      if (input.op === "add") {
        if (stops.length >= 25) return apiError("RULE", "Up to 25 stops are supported.", 409);
        let business: { id: string; name: string; latitude: number; longitude: number; category: string } | null = null;
        if (input.businessId) {
          const { data } = await access.supabase.from("businesses").select("id,name,latitude,longitude,category").eq("id", input.businessId).maybeSingle();
          if (!data) return apiError("NOT_FOUND", "That business was not found.", 404);
          business = { ...data, latitude: Number(data.latitude), longitude: Number(data.longitude) };
        }
        const next = stops.reduce((max, stop) => Math.max(max, stop.position, stop.userPosition), -1) + 1;
        const { error } = await access.supabase.from("itinerary_stops").insert({
          itinerary_id: id.data, position: next, user_position: next, errand_label: input.label, mandatory: input.mandatory,
          category: business?.category ?? input.category ?? null, service_query: input.serviceQuery ?? input.label,
          business_id: business?.id ?? null, place_label: business?.name ?? input.place?.label ?? null,
          latitude: business?.latitude ?? input.place?.latitude ?? null, longitude: business?.longitude ?? input.place?.longitude ?? null,
        });
        if (error) return dbError(error, "trip_stop_add_failed");
      } else if (input.op === "remove") {
        const { error } = await access.supabase.from("itinerary_stops").delete().eq("id", input.stopId).eq("itinerary_id", id.data);
        if (error) return dbError(error, "trip_stop_remove_failed");
      } else if (input.op === "reorder") {
        // The user's own order; the optimiser's order is compared against it.
        for (const [index, stopId] of input.stopIds.entries()) {
          const { error } = await access.supabase.from("itinerary_stops").update({ user_position: index }).eq("id", stopId).eq("itinerary_id", id.data);
          if (error) return dbError(error, "trip_stop_reorder_failed");
        }
      } else {
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (input.mandatory !== undefined) patch.mandatory = input.mandatory;
        if (input.deadlineAt !== undefined) patch.deadline_at = input.deadlineAt;
        if (input.deadlineKind !== undefined) patch.deadline_kind = input.deadlineKind;
        if (input.preferredFrom !== undefined) patch.preferred_from = input.preferredFrom;
        if (input.preferredTo !== undefined) patch.preferred_to = input.preferredTo;
        if (input.serviceMinutes !== undefined) patch.service_minutes = input.serviceMinutes;
        if (input.businessId) {
          const { data } = await access.supabase.from("businesses").select("id,name,latitude,longitude").eq("id", input.businessId).maybeSingle();
          if (!data) return apiError("NOT_FOUND", "That business was not found.", 404);
          Object.assign(patch, { business_id: data.id, place_label: data.name, latitude: data.latitude, longitude: data.longitude, service_id: null, status: "planned" });
        }
        const { error } = await access.supabase.from("itinerary_stops").update(patch).eq("id", input.stopId).eq("itinerary_id", id.data);
        if (error) return dbError(error, "trip_stop_edit_failed");
      }
      await reopenForChanges(access, loaded.itinerary);
      const result = await runWorkflow(access, id.data, "user");
      return apiReply({ state: result.itinerary.workflowState });
    }
  } catch (failure) {
    if (failure instanceof WorkflowConflict) return apiError("CONFLICT", failure.message, 409);
    return apiError("PLANNER_FAILED", "The planner could not finish. Press Retry.", 503);
  }
  return apiError("NOT_FOUND", "Unknown trip action.", 404);
}
