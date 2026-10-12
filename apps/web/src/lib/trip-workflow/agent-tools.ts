import "server-only";
import { z } from "zod";
import { fuelCost } from "@geo/cost.ts";
import { businessCategories, businessDetails, searchBusinesses } from "../businesses";
import type { ToolSpec } from "../assistant/llm";
import { loadItinerary, reopenForChanges, runWorkflow, type Access } from "./service";

// Controlled tools for the optional planner chat. Each one validates its arguments, runs as the
// signed-in user (RLS applies) and returns only what the model needs. Tools that would contact a
// business or commit the trip only create pending actions for the user to approve.
type Tool = { spec: ToolSpec; schema: z.ZodType; run: (access: Access, itineraryId: string, args: never) => Promise<Record<string, unknown>> };

const near = async (access: Access, itineraryId: string) => {
  const loaded = await loadItinerary(access, itineraryId);
  if (!loaded) throw new Error("Trip not found.");
  const { itinerary } = loaded;
  return { loaded, near: itinerary.originLatitude !== null ? { latitude: itinerary.originLatitude, longitude: itinerary.originLongitude! } : null };
};

const define = <S extends z.ZodType>(name: string, description: string, schema: S, run: (access: Access, itineraryId: string, args: z.infer<S>) => Promise<Record<string, unknown>>): Tool => ({
  spec: { name, description, parameters: z.toJSONSchema(schema) as Record<string, unknown> },
  schema,
  run: run as Tool["run"],
});

export const plannerTools: Tool[] = [
  define("search_businesses", "Search businesses near the trip start by service or name. Returns ids, names, straight-line km and availability state.",
    z.object({ query: z.string().max(80), category: z.enum(businessCategories).optional() }),
    async (access, itineraryId, args) => {
      const { near: origin } = await near(access, itineraryId);
      const result = await searchBusinesses(access.supabase, { query: args.query, category: args.category ?? null, near: origin, radiusKm: 15, limit: 6 });
      if (!result.ok) return { error: "search unavailable" };
      return { businesses: result.businesses.map((business) => ({ id: business.id, name: business.name, category: business.category, km: business.distanceKm?.toFixed(1) ?? null, availability: business.availability.state, demo: business.isDemo })) };
    }),
  define("get_business_details", "Services, published hours and current availability for one business.",
    z.object({ businessId: z.uuid() }),
    async (access, _itineraryId, args) => {
      const result = await businessDetails(access.supabase, args.businessId);
      if (!result.ok) return { error: "not found" };
      return {
        name: result.business.name, availability: result.availability.state, explanation: result.availability.explanation,
        services: result.services.map((service) => ({ id: service.id, name: service.name, availability: service.availability.state })),
        publishedHours: result.business.publishedHoursText, hoursRows: result.hours.length, demo: result.business.isDemo,
      };
    }),
  define("request_availability_confirmation", "Propose asking a business to confirm. Nothing is sent until the user approves it in the plan.",
    z.object({ businessId: z.uuid(), stopId: z.uuid().optional(), question: z.string().min(3).max(200) }),
    async (access, itineraryId, args) => {
      const { error } = await access.supabase.from("pending_actions").insert({
        itinerary_id: itineraryId, user_id: access.profile.id, action_type: "send_confirmation_request", proposed_by: "agent",
        summary: `Ask a business to confirm: ${args.question}`.slice(0, 300), payload: { businessId: args.businessId, stopId: args.stopId ?? null, question: args.question },
      });
      return error ? { error: "could not propose" } : { proposed: true, sent: false, note: "Waiting for the user's approval." };
    }),
  define("check_confirmation_status", "Status of confirmation requests already sent for this trip.",
    z.object({}),
    async (access, itineraryId) => {
      const { data } = await access.supabase.from("verification_events").select("status,question,response_note,expires_at,businesses(name)").eq("itinerary_id", itineraryId).order("requested_at", { ascending: false }).limit(10);
      const now = Date.now();
      return { requests: (data ?? []).map((row) => ({ business: (row.businesses as unknown as { name: string } | null)?.name, status: row.status === "requested" && Date.parse(row.expires_at) <= now ? "expired" : row.status, reply: row.response_note })) };
    }),
  define("get_route_matrix", "How distances for this trip were estimated (road or straight-line) and by which provider.",
    z.object({}),
    async (access, itineraryId) => {
      const { loaded } = await near(access, itineraryId);
      return { routing: loaded.itinerary.metrics.routing ?? null };
    }),
  define("calculate_fuel_cost", "Fuel litres and PKR for a distance using this trip's efficiency and petrol price.",
    z.object({ distanceKm: z.number().min(0).max(2000) }),
    async (access, itineraryId, args) => {
      const { loaded } = await near(access, itineraryId);
      const { kmPerLitre, pricePkrPerLitre } = loaded.itinerary;
      if (!kmPerLitre || !pricePkrPerLitre) return { error: "efficiency or price not set" };
      const cost = fuelCost(args.distanceKm, { kmPerLitre, pricePkrPerLitre });
      return { distanceKm: args.distanceKm, litres: cost.fuelLitres.toFixed(2), costPkr: Math.round(cost.fuelCostPkr), kmPerLitre, pricePkrPerLitre };
    }),
  define("optimize_itinerary", "Recalculate the plan with the current stops and availability. Returns the new totals.",
    z.object({}),
    async (access, itineraryId) => {
      const { loaded } = await near(access, itineraryId);
      await reopenForChanges(access, loaded.itinerary);
      const result = await runWorkflow(access, itineraryId, "llm");
      const metrics = result.itinerary.metrics as Record<string, unknown>;
      return { state: result.itinerary.workflowState, km: typeof metrics.distanceKm === "number" ? metrics.distanceKm.toFixed(1) : null, fuelPkr: typeof metrics.fuelCostPkr === "number" ? Math.round(metrics.fuelCostPkr) : null, optimality: metrics.optimality ?? null, uncertainStops: metrics.uncertainStops ?? [] };
    }),
  define("find_alternatives", "Other businesses found for one stop, with availability.",
    z.object({ stopId: z.uuid() }),
    async (access, itineraryId, args) => {
      const { loaded } = await near(access, itineraryId);
      return { alternatives: ((loaded.itinerary.metrics.alternatives ?? {}) as Record<string, unknown>)[args.stopId] ?? [] };
    }),
  define("save_itinerary", "Confirm the current plan is saved. Starting the trip still needs the user's approval in the plan.",
    z.object({}),
    async (access, itineraryId) => {
      const { loaded } = await near(access, itineraryId);
      return { saved: true, state: loaded.itinerary.workflowState, approvalNeeded: loaded.itinerary.workflowState === "AWAITING_APPROVAL" };
    }),
  define("record_trip_outcome", "Record what happened at one stop: success, failed (with cause) or skipped. 'Avoided' trips need the user's own confirmation in the app.",
    z.object({ stopId: z.uuid(), outcome: z.enum(["success", "failed", "skipped"]), failureCause: z.enum(["closed", "service_unavailable", "part_unavailable", "long_wait", "not_found", "other"]).optional() }),
    async (access, _itineraryId, args) => {
      const { error } = await access.supabase.rpc("record_trip_outcome", { target_stop: args.stopId, stop_outcome: args.outcome, cause: args.failureCause ?? null, outcome_note: null, avoided_km: null, avoided_kind: null });
      return error ? { error: error.code === "P0001" ? error.message : "could not record" } : { recorded: true };
    }),
];

export async function runPlannerTool(access: Access, itineraryId: string, name: string, args: unknown) {
  const tool = plannerTools.find((candidate) => candidate.spec.name === name);
  if (!tool) return { error: "Unknown tool." };
  const parsed = tool.schema.safeParse(args ?? {});
  if (!parsed.success) return { error: "Invalid arguments.", issues: parsed.error.issues.slice(0, 3).map((issue) => issue.message) };
  try {
    return await tool.run(access, itineraryId, parsed.data as never);
  } catch {
    return { error: "Tool failed." };
  }
}

// Every number in the model's reply must appear in a tool result or the user's own message.
export function numbersGrounded(answer: string, sources: unknown[]) {
  const ascii = (text: string) => text.replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  const allowed = new Set<string>();
  for (const source of sources) for (const number of ascii(JSON.stringify(source)).match(/\d+(?:\.\d+)?/g) ?? []) {
    allowed.add(number);
    allowed.add(String(Number(number)));
    allowed.add(String(Math.round(Number(number))));
  }
  return (ascii(answer).match(/\d+(?:\.\d+)?/g) ?? []).every((number) => allowed.has(number) || allowed.has(String(Number(number))));
}
