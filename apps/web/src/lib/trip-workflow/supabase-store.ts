import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoursRow } from "@geo/hours.ts";
import { normaliseState } from "../availability-machine";
import { searchBusinesses } from "../businesses";
import { optimize, travelMatrix } from "../geo/client";
import type { AvailabilityLookup } from "./engine";
import { WorkflowConflict, type Itinerary, type Stop, type WorkflowGeo, type WorkflowStore } from "./types";

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export const itineraryColumns = "id,user_id,request_text,workflow_state,workflow_version,origin_label,origin_latitude,origin_longitude,return_to_origin,depart_at,km_per_litre,price_pkr_per_litre,max_trip_minutes,preferred_max_cost_pkr,weights,metrics,needs_recalculation,is_demo,estimate_kind,optimality,approved_at,risk_acknowledged_at,title,created_at,updated_at";
export const stopColumns = "id,position,user_position,errand_label,category,service_query,business_id,service_id,place_label,latitude,longitude,mandatory,deadline_at,deadline_kind,preferred_from,preferred_to,service_minutes,status,alternative_of,planned_arrival_at,planned_departure_at,appointment_request_id";

export function toItinerary(row: Record<string, unknown>): Itinerary {
  return {
    id: String(row.id), userId: String(row.user_id), requestText: (row.request_text as string | null) ?? null,
    workflowState: row.workflow_state as Itinerary["workflowState"], workflowVersion: Number(row.workflow_version),
    originLabel: (row.origin_label as string | null) ?? null, originLatitude: num(row.origin_latitude), originLongitude: num(row.origin_longitude),
    returnToOrigin: row.return_to_origin !== false, departAt: (row.depart_at as string | null) ?? null,
    kmPerLitre: num(row.km_per_litre), pricePkrPerLitre: num(row.price_pkr_per_litre), maxTripMinutes: num(row.max_trip_minutes),
    preferredMaxCostPkr: num(row.preferred_max_cost_pkr), weights: (row.weights as Itinerary["weights"]) ?? {}, metrics: (row.metrics as Record<string, unknown>) ?? {},
    needsRecalculation: row.needs_recalculation === true, isDemo: row.is_demo === true,
  };
}

export function toStop(row: Record<string, unknown>): Stop {
  return {
    id: String(row.id), position: Number(row.position), userPosition: Number(row.user_position), errandLabel: String(row.errand_label),
    category: (row.category as Stop["category"]) ?? null, serviceQuery: (row.service_query as string | null) ?? null,
    businessId: (row.business_id as string | null) ?? null, serviceId: (row.service_id as string | null) ?? null,
    placeLabel: (row.place_label as string | null) ?? null, latitude: num(row.latitude), longitude: num(row.longitude),
    mandatory: row.mandatory !== false, deadlineAt: (row.deadline_at as string | null) ?? null, deadlineKind: row.deadline_kind === "hard" ? "hard" : "soft",
    preferredFrom: (row.preferred_from as string | null) ?? null, preferredTo: (row.preferred_to as string | null) ?? null,
    serviceMinutes: Number(row.service_minutes ?? 15), status: row.status as Stop["status"], alternativeOf: (row.alternative_of as string | null) ?? null,
  };
}

const itineraryPatch = (patch: Partial<Itinerary>) => {
  const map: Record<string, unknown> = {};
  if ("requestText" in patch) map.request_text = patch.requestText;
  if ("originLabel" in patch) map.origin_label = patch.originLabel;
  if ("originLatitude" in patch) map.origin_latitude = patch.originLatitude;
  if ("originLongitude" in patch) map.origin_longitude = patch.originLongitude;
  if ("returnToOrigin" in patch) map.return_to_origin = patch.returnToOrigin;
  if ("departAt" in patch) map.depart_at = patch.departAt;
  if ("kmPerLitre" in patch) map.km_per_litre = patch.kmPerLitre;
  if ("pricePkrPerLitre" in patch) map.price_pkr_per_litre = patch.pricePkrPerLitre;
  if ("maxTripMinutes" in patch) map.max_trip_minutes = patch.maxTripMinutes;
  if ("preferredMaxCostPkr" in patch) map.preferred_max_cost_pkr = patch.preferredMaxCostPkr;
  if ("weights" in patch) map.weights = patch.weights;
  if ("metrics" in patch) {
    map.metrics = patch.metrics;
    if (typeof patch.metrics?.estimateKind === "string" && ["road", "straight_line", "mixed"].includes(patch.metrics.estimateKind)) map.estimate_kind = patch.metrics.estimateKind;
    if (typeof patch.metrics?.optimality === "string") map.optimality = patch.metrics.optimality;
  }
  if ("needsRecalculation" in patch) map.needs_recalculation = patch.needsRecalculation;
  return map;
};

const stopPatch = (patch: Partial<Stop>) => {
  const map: Record<string, unknown> = {};
  const keys: Array<[keyof Stop, string]> = [["position", "position"], ["userPosition", "user_position"], ["errandLabel", "errand_label"], ["category", "category"], ["serviceQuery", "service_query"],
    ["businessId", "business_id"], ["serviceId", "service_id"], ["placeLabel", "place_label"], ["latitude", "latitude"], ["longitude", "longitude"], ["mandatory", "mandatory"],
    ["deadlineAt", "deadline_at"], ["deadlineKind", "deadline_kind"], ["preferredFrom", "preferred_from"], ["preferredTo", "preferred_to"], ["serviceMinutes", "service_minutes"],
    ["status", "status"], ["alternativeOf", "alternative_of"]];
  for (const [key, column] of keys) if (key in patch) map[column] = patch[key];
  return map;
};

export function supabaseWorkflowStore(client: SupabaseClient): WorkflowStore {
  return {
    async load(id) {
      const [itinerary, stops] = await Promise.all([
        client.from("itineraries").select(itineraryColumns).eq("id", id).maybeSingle(),
        client.from("itinerary_stops").select(stopColumns).eq("itinerary_id", id).order("position"),
      ]);
      if (itinerary.error) throw itinerary.error;
      if (stops.error) throw stops.error;
      return itinerary.data ? { itinerary: toItinerary(itinerary.data), stops: (stops.data ?? []).map(toStop) } : null;
    },
    async transition(current, to, patch = {}) {
      const { data, error } = await client.from("itineraries").update({ ...itineraryPatch(patch), workflow_state: to })
        .eq("id", current.id).eq("workflow_version", current.workflowVersion).select(itineraryColumns);
      if (error) throw error;
      if (!data?.length) throw new WorkflowConflict();
      return toItinerary(data[0]);
    },
    async update(current, patch) {
      const { data, error } = await client.from("itineraries").update({ ...itineraryPatch(patch), updated_at: new Date().toISOString() }).eq("id", current.id).select(itineraryColumns).single();
      if (error) throw error;
      return toItinerary(data);
    },
    async insertStops(itineraryId, stops) {
      const { data, error } = await client.from("itinerary_stops").insert(stops.map((stop) => ({ itinerary_id: itineraryId, ...stopPatch(stop) }))).select(stopColumns);
      if (error) throw error;
      return (data ?? []).map(toStop).sort((a, b) => a.position - b.position);
    },
    async updateStop(stopId, patch) {
      const { error } = await client.from("itinerary_stops").update({ ...stopPatch(patch), updated_at: new Date().toISOString() }).eq("id", stopId);
      if (error) throw error;
    },
    async logStep(itineraryId, entry) {
      await client.from("workflow_steps").insert({
        itinerary_id: itineraryId, step: entry.step, status: entry.status, actor: entry.actor, from_state: entry.from, to_state: entry.to,
        input_summary: entry.input ?? {}, output_summary: entry.output ?? {}, error: entry.error ?? null, finished_at: new Date().toISOString(),
      });
    },
    async searchBusinesses({ query, categories, near, radiusKm }) {
      const results = await Promise.all((categories.length ? categories : [null]).map((category) => searchBusinesses(client, { query, category, near, radiusKm, limit: 10 })));
      const seen = new Set<string>();
      return results.flatMap((result) => (result.ok ? result.businesses : [])).filter((business) => (seen.has(business.id) ? false : (seen.add(business.id), true)))
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    },
    async businessHours(ids) {
      const map = new Map<string, HoursRow[]>();
      if (!ids.length) return map;
      const { data, error } = await client.from("business_hours").select("business_id,weekday,opens_at,closes_at,closes_next_day,is_closed,valid_on").in("business_id", ids);
      if (error) throw error;
      for (const row of data ?? []) {
        const list = map.get(row.business_id) ?? [];
        list.push({ weekday: row.weekday, opensAt: String(row.opens_at).slice(0, 5), closesAt: String(row.closes_at).slice(0, 5), closesNextDay: row.closes_next_day, isClosed: row.is_closed, validOn: row.valid_on });
        map.set(row.business_id, list);
      }
      return map;
    },
    async defaults(userId) {
      const [preferences, vehicles, price] = await Promise.all([
        client.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
        client.from("driver_vehicles").select("id,estimated_km_per_litre,fuel_type").eq("user_id", userId).order("created_at"),
        client.from("fuel_price_settings").select("price_pkr_per_litre,source,set_at").eq("user_id", userId).eq("fuel_type", "petrol").order("set_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const prefs = preferences.data;
      const vehicle = (vehicles.data ?? []).find((item) => item.id === prefs?.default_vehicle_id) ?? (vehicles.data ?? []).find((item) => item.estimated_km_per_litre);
      return {
        kmPerLitre: num(prefs?.km_per_litre) ?? num(vehicle?.estimated_km_per_litre),
        pricePkrPerLitre: num(price.data?.price_pkr_per_litre),
        priceSource: price.data ? `${price.data.source}:${price.data.set_at}` : null,
        timeWeightPkrPerMinute: num(prefs?.time_weight_pkr_per_minute) ?? 2,
        failedVisitPenaltyPkr: num(prefs?.failed_visit_penalty_pkr) ?? 300,
        missedDeadlinePenaltyPkr: num(prefs?.missed_deadline_penalty_pkr) ?? 500,
        maxTripMinutes: num(prefs?.max_trip_minutes),
      };
    },
    async proposeAction(itinerary, type, payload, summary, proposedBy) {
      const { error } = await client.from("pending_actions").insert({ itinerary_id: itinerary.id, user_id: itinerary.userId, action_type: type, payload, summary: summary.slice(0, 300), proposed_by: proposedBy });
      if (error) throw error;
    },
    async openActions(itineraryId) {
      const { data, error } = await client.from("pending_actions").select("id,action_type,payload,status").eq("itinerary_id", itineraryId).order("created_at");
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, actionType: row.action_type, payload: row.payload, status: row.status }));
    },
    async saveRevision(itinerary, reason, stops, metrics) {
      const { data, error } = await client.rpc("save_itinerary_revision", {
        target_itinerary: itinerary.id, revision_reason: reason, stops, revision_metrics: metrics, expected_version: itinerary.workflowVersion,
      });
      if (error) {
        if (error.code === "40001") throw new WorkflowConflict();
        throw error;
      }
      return Number(data);
    },
  };
}

export function supabaseAvailability(client: SupabaseClient): AvailabilityLookup {
  return async (ids) => {
    const entries = await Promise.all([...new Set(ids)].map(async (id) => {
      const { data } = await client.rpc("current_availability", { target_business: id });
      const row = (data as Array<Record<string, unknown>> | null)?.[0];
      return [id, { state: normaliseState(row?.state), until: (row?.effective_until as string | null) ?? null, source: (row?.source as string | null) ?? null }] as const;
    }));
    return new Map(entries);
  };
}

export function workflowGeo(accessToken: string | null): WorkflowGeo {
  return {
    matrix: (points) => travelMatrix(points, accessToken),
    optimize: (problem, userOrder) => optimize(problem, userOrder, accessToken),
  };
}
