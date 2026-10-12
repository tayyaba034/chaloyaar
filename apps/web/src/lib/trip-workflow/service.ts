import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "../log";
import { advanceWorkflow } from "./engine";
import { canTransition, type WorkflowState } from "./states";
import { itineraryColumns, stopColumns, supabaseAvailability, supabaseWorkflowStore, toItinerary, toStop, workflowGeo } from "./supabase-store";
import { WorkflowConflict, type Itinerary } from "./types";

export type Access = { supabase: SupabaseClient; profile: { id: string } };

export async function accessToken(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function runWorkflow(access: Access, itineraryId: string, actor: "system" | "user" | "llm" = "system") {
  const deps = {
    store: supabaseWorkflowStore(access.supabase),
    geo: workflowGeo(await accessToken(access.supabase)),
    availability: supabaseAvailability(access.supabase),
    actor,
  };
  try {
    return await advanceWorkflow(deps, itineraryId);
  } catch (error) {
    if (error instanceof WorkflowConflict) throw error;
    log.error("workflow_failed", { name: error instanceof Error ? error.name : "unknown" });
    const loaded = await deps.store.load(itineraryId);
    if (loaded && canTransition(loaded.itinerary.workflowState, "FAILED") && loaded.itinerary.workflowState !== "FAILED") {
      await deps.store.transition(loaded.itinerary, "FAILED").catch(() => undefined);
      await deps.store.logStep(itineraryId, { step: "recalculate", status: "failed", actor, from: loaded.itinerary.workflowState, to: "FAILED", error: "The planner hit an error. Retry to continue." });
    }
    throw error;
  }
}

// After the user edits stops or settings, move the plan back to a state that recomputes it.
export async function reopenForChanges(access: Access, itinerary: Itinerary) {
  const store = supabaseWorkflowStore(access.supabase);
  const next: Partial<Record<WorkflowState, WorkflowState>> = {
    NEEDS_INFO: "PARSED", PROPOSED: "RECALCULATING", AWAITING_APPROVAL: "RECALCULATING", APPROVED: "RECALCULATING", IN_PROGRESS: "RECALCULATING", FAILED: "PARSED",
  };
  const target = next[itinerary.workflowState];
  if (target) await store.transition(itinerary, target, { needsRecalculation: target === "RECALCULATING" ? true : itinerary.needsRecalculation });
}

export function navigationUrl(origin: { latitude: number; longitude: number } | null, stops: Array<{ latitude: number | null; longitude: number | null }>, returnToOrigin: boolean) {
  const points = stops.filter((stop) => stop.latitude !== null && stop.longitude !== null).map((stop) => `${stop.latitude},${stop.longitude}`);
  if (!origin || !points.length) return null;
  const destination = returnToOrigin ? `${origin.latitude},${origin.longitude}` : points[points.length - 1];
  const waypoints = returnToOrigin ? points : points.slice(0, -1);
  const params = new URLSearchParams({ api: "1", origin: `${origin.latitude},${origin.longitude}`, destination, travelmode: "driving" });
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params}`;
}

export async function tripView(access: Access, itineraryId: string) {
  const supabase = access.supabase;
  const [itinerary, stops, steps, actions, revisions, trip, outcomes] = await Promise.all([
    supabase.from("itineraries").select(itineraryColumns).eq("id", itineraryId).maybeSingle(),
    supabase.from("itinerary_stops").select(stopColumns).eq("itinerary_id", itineraryId).order("position"),
    supabase.from("workflow_steps").select("id,step,status,actor,from_state,to_state,input_summary,output_summary,error,started_at").eq("itinerary_id", itineraryId).order("started_at", { ascending: false }).limit(80),
    supabase.from("pending_actions").select("id,action_type,payload,summary,status,proposed_by,approved_at,executed_at,result,expires_at,created_at").eq("itinerary_id", itineraryId).order("created_at"),
    supabase.from("itinerary_revisions").select("revision,reason,metrics,created_at").eq("itinerary_id", itineraryId).order("revision"),
    supabase.from("trips").select("*").eq("itinerary_id", itineraryId).maybeSingle(),
    supabase.from("trip_outcomes").select("id,itinerary_stop_id,outcome,failure_cause,evidence,avoided_round_trip_km,avoided_estimate_kind,avoided_fuel_cost_pkr,note,recorded_at").eq("itinerary_id", itineraryId),
  ]);
  const failed = [itinerary, stops, steps, actions, revisions, trip, outcomes].find((result) => result.error);
  if (failed?.error) return { ok: false as const, error: failed.error };
  if (!itinerary.data) return { ok: false as const, notFound: true as const };
  const parsed = toItinerary(itinerary.data);
  const stopRows = (stops.data ?? []).map((row) => ({ ...toStop(row), plannedArrivalAt: row.planned_arrival_at as string | null, plannedDepartureAt: row.planned_departure_at as string | null }));
  const availability = await supabaseAvailability(supabase)(stopRows.flatMap((stop) => (stop.businessId ? [stop.businessId] : [])));
  const now = Date.now();
  const origin = parsed.originLatitude !== null && parsed.originLongitude !== null ? { latitude: parsed.originLatitude, longitude: parsed.originLongitude } : null;
  const ordered = stopRows.filter((stop) => stop.status === "planned" || stop.status === "visited").sort((a, b) => a.position - b.position);
  return {
    ok: true as const,
    itinerary: { ...parsed, raw: { title: itinerary.data.title, approvedAt: itinerary.data.approved_at, riskAcknowledgedAt: itinerary.data.risk_acknowledged_at, createdAt: itinerary.data.created_at } },
    stops: stopRows.map((stop) => ({ ...stop, availability: stop.businessId ? availability.get(stop.businessId) ?? null : null })),
    steps: steps.data ?? [],
    actions: (actions.data ?? []).map((action) => ({ ...action, status: action.status === "proposed" && Date.parse(action.expires_at) <= now ? "expired" : action.status })),
    revisions: revisions.data ?? [],
    trip: trip.data,
    outcomes: outcomes.data ?? [],
    navigationUrl: navigationUrl(origin, ordered, parsed.returnToOrigin),
  };
}

export type ActionDecision = { decision: "approve" | "reject"; acknowledgeRisk?: boolean };

// Executes one pending action after the signed-in user explicitly approves it.
export async function decideAction(access: Access, itineraryId: string, actionId: string, input: ActionDecision) {
  const supabase = access.supabase;
  const { data: action, error } = await supabase.from("pending_actions").select("id,action_type,payload,status,expires_at,itinerary_id").eq("id", actionId).eq("itinerary_id", itineraryId).maybeSingle();
  if (error) return { ok: false as const, error };
  if (!action) return { ok: false as const, message: "That action was not found.", status: 404 };
  if (action.status !== "proposed" || Date.parse(action.expires_at) <= Date.now()) return { ok: false as const, message: "This action is no longer waiting for approval.", status: 409 };
  if (input.decision === "reject") {
    await supabase.from("pending_actions").update({ status: "rejected" }).eq("id", actionId);
    return { ok: true as const, result: { rejected: true } };
  }
  await supabase.from("pending_actions").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", actionId);
  const payload = action.payload as Record<string, unknown>;
  let result: Record<string, unknown>;
  try {
    if (action.action_type === "send_confirmation_request") {
      const { data, error: rpcError } = await supabase.rpc("request_confirmation", {
        target_business: payload.businessId, request_question: String(payload.question ?? "Can you help today?").slice(0, 200), target_service: payload.serviceId ?? null,
        start_at: null, end_at: null, target_itinerary: itineraryId, target_stop: payload.stopId ?? null,
      });
      if (rpcError) throw rpcError;
      const row = (data as Array<{ request_id: string; request_status: string; failure: string | null }>)[0];
      result = { requestId: row.request_id, status: row.request_status, failure: row.failure };
    } else if (action.action_type === "request_appointment") {
      const { data, error: rpcError } = await supabase.rpc("request_appointment", {
        target_business: payload.businessId, start_at: payload.windowStart, end_at: payload.windowEnd, target_service: payload.serviceId ?? null,
        request_note: payload.note ?? null, target_stop: payload.stopId ?? null,
      });
      if (rpcError) throw rpcError;
      result = { appointmentId: data };
    } else {
      const loaded = await supabaseWorkflowStore(supabase).load(itineraryId);
      if (!loaded) throw new Error("Itinerary not found.");
      const { itinerary } = loaded;
      if (itinerary.workflowState !== "AWAITING_APPROVAL" || itinerary.needsRecalculation) {
        await supabase.from("pending_actions").update({ status: "proposed", approved_at: null }).eq("id", actionId);
        return { ok: false as const, message: "The plan changed. Recalculate it before approving.", status: 409 };
      }
      const uncertain = (itinerary.metrics.uncertainStops as string[] | undefined) ?? [];
      if (uncertain.length && !input.acknowledgeRisk) {
        await supabase.from("pending_actions").update({ status: "proposed", approved_at: null }).eq("id", actionId);
        return { ok: false as const, message: "Some stops are not confirmed. Tick the box to accept the risk, or ask them to confirm first.", status: 409 };
      }
      const now = new Date().toISOString();
      const store = supabaseWorkflowStore(supabase);
      // State and approval time change together; the database rejects APPROVED without approved_at.
      const { data: approvedRows, error: approveError } = await supabase.from("itineraries")
        .update({ workflow_state: "APPROVED", approved_at: now, approved_revision: (payload.revision as number) ?? null, risk_acknowledged_at: uncertain.length ? now : null })
        .eq("id", itineraryId).eq("workflow_version", itinerary.workflowVersion).select("workflow_state");
      if (approveError) throw approveError;
      if (!approvedRows?.length) throw new WorkflowConflict();
      const approved = { workflowState: approvedRows[0].workflow_state as WorkflowState };
      const metrics = itinerary.metrics as { distanceKm?: number; estimateKind?: string };
      const { data: trip, error: tripError } = await supabase.from("trips").upsert({
        itinerary_id: itineraryId, user_id: access.profile.id, status: "planned",
        planned_distance_km: Number((metrics.distanceKm ?? 0).toFixed(2)), planned_estimate_kind: metrics.estimateKind ?? "straight_line",
        km_per_litre_snapshot: itinerary.kmPerLitre, price_pkr_per_litre_snapshot: itinerary.pricePkrPerLitre, is_demo: itinerary.isDemo,
      }, { onConflict: "itinerary_id" }).select("id").single();
      if (tripError) throw tripError;
      await store.logStep(itineraryId, { step: "execute_action", status: "succeeded", actor: "user", from: "AWAITING_APPROVAL", to: approved.workflowState, output: { action: "commit_trip", riskAccepted: uncertain.length > 0 } });
      result = { tripId: trip.id };
    }
  } catch (failure) {
    const message = (failure as { message?: string; code?: string }).code === "P0001" ? (failure as { message: string }).message : "The action could not be completed.";
    await supabase.from("pending_actions").update({ status: "failed", result: { message } }).eq("id", actionId);
    return { ok: false as const, message, status: 409 };
  }
  await supabase.from("pending_actions").update({ status: "executed", executed_at: new Date().toISOString(), result }).eq("id", actionId);
  if (action.action_type !== "commit_trip") {
    await supabaseWorkflowStore(supabase).logStep(itineraryId, { step: "execute_action", status: "succeeded", actor: "user", from: "AWAITING_APPROVAL", to: "AWAITING_APPROVAL", output: { action: action.action_type, ...result } });
  }
  return { ok: true as const, result };
}

export async function recentTrips(access: Access) {
  return access.supabase.from("itineraries").select("id,title,request_text,workflow_state,metrics,estimate_kind,optimality,needs_recalculation,created_at,updated_at,is_demo")
    .eq("user_id", access.profile.id).order("updated_at", { ascending: false }).limit(20);
}

export async function loadItinerary(access: Access, itineraryId: string) {
  return supabaseWorkflowStore(access.supabase).load(itineraryId);
}
