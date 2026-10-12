import { describe, expect, it, vi } from "vitest";
import { buildTravelMatrix } from "@geo/matrix.ts";
import { compareOrders, solveItinerary } from "@geo/solver/index.ts";
import type { BusinessSummary } from "../businesses";
import type { AvailabilityState } from "../availability-machine";
import { advanceWorkflow, type AvailabilityLookup } from "./engine";
import { canTransition } from "./states";
import type { Itinerary, Stop, WorkflowGeo, WorkflowStore } from "./types";
import { WorkflowConflict } from "./types";

vi.mock("server-only", () => ({}));

const business = (id: string, category: BusinessSummary["category"], latitude: number, longitude: number, state: AvailabilityState, services: string[] = []): BusinessSummary => ({
  id, name: `Biz ${id}`, category, description: null, address: null, phone: null, latitude, longitude, listingStatus: "active", isDemo: false,
  publishedHoursText: null, distanceKm: 1, availability: { state, source: null, submittedAt: null, until: null, explanation: null },
  services: services.map((name, index) => ({ id: `${id}-s${index}`, name, tag: null, durationMinutes: 30, priceNote: null })),
});

function memoryStore(directory: BusinessSummary[], overrides: Partial<Itinerary> = {}) {
  let itinerary: Itinerary = {
    id: "trip", userId: "u", requestText: "Get my car AC checked, buy medicine and collect a document today. Cheapest trip.",
    workflowState: "DRAFT", workflowVersion: 0, originLabel: "Home", originLatitude: 31.418, originLongitude: 73.079, returnToOrigin: true,
    departAt: "2026-10-12T05:00:00Z", kmPerLitre: null, pricePkrPerLitre: null, maxTripMinutes: null, preferredMaxCostPkr: null,
    weights: {}, metrics: {}, needsRecalculation: false, isDemo: false, ...overrides,
  };
  let stops: Stop[] = [];
  const actions: Array<{ id: string; actionType: string; payload: Record<string, unknown>; status: string }> = [];
  const logs: string[] = [];
  const store: WorkflowStore & { actions: typeof actions; logs: string[]; snapshot: () => { itinerary: Itinerary; stops: Stop[] } } = {
    actions, logs,
    snapshot: () => ({ itinerary, stops }),
    async load() { return { itinerary: { ...itinerary }, stops: stops.map((stop) => ({ ...stop })) }; },
    async transition(current, to, patch = {}) {
      if (current.workflowVersion !== itinerary.workflowVersion) throw new WorkflowConflict();
      if (!canTransition(itinerary.workflowState, to)) throw new Error(`bad transition ${itinerary.workflowState} -> ${to}`);
      itinerary = { ...itinerary, ...patch, workflowState: to, workflowVersion: itinerary.workflowVersion + 1 };
      return { ...itinerary };
    },
    async update(_current, patch) { itinerary = { ...itinerary, ...patch }; return { ...itinerary }; },
    async insertStops(_id, newStops) { stops = newStops.map((stop, index) => ({ ...stop, id: `stop-${index}` })); return stops.map((stop) => ({ ...stop })); },
    async updateStop(id, patch) { stops = stops.map((stop) => (stop.id === id ? { ...stop, ...patch } : stop)); },
    async logStep(_id, entry) { logs.push(`${entry.step}:${entry.status}`); },
    async searchBusinesses({ categories, query }) {
      return directory.filter((item) => (!categories.length || categories.includes(item.category)) && (!query || item.services.some((service) => service.name.toLowerCase().includes(query.split(" ")[0])) || item.category === categories[0]));
    },
    async businessHours() { return new Map(); },
    async defaults() { return { kmPerLitre: 12.5, pricePkrPerLitre: 250, priceSource: "user", timeWeightPkrPerMinute: 2, failedVisitPenaltyPkr: 300, missedDeadlinePenaltyPkr: 500, maxTripMinutes: null }; },
    async proposeAction(_itinerary, type, payload) { actions.push({ id: `a${actions.length}`, actionType: type, payload, status: "proposed" }); },
    async openActions() { return actions.map((action) => ({ ...action, actionType: action.actionType as never })); },
    async saveRevision(_itinerary, _reason, revisionStops) {
      stops = stops.map((stop) => {
        const revised = revisionStops.find((item) => item.id === stop.id);
        return revised ? { ...stop, position: revised.position, status: revised.status as Stop["status"] } : stop;
      });
      return 1;
    },
  };
  return store;
}

const geo: WorkflowGeo = {
  matrix: async (points) => ({ ...(await buildTravelMatrix(points)), engine: "in_process" }),
  optimize: async (problem, userOrder) => {
    const result = solveItinerary(problem);
    return { result, comparison: result.status === "ok" ? compareOrders(problem, userOrder, result.best) : null, engine: "in_process" };
  },
};

const lookup = (directory: BusinessSummary[]): AvailabilityLookup => async (ids) => new Map(ids.map((id) => {
  const found = directory.find((item) => item.id === id)!;
  return [id, { state: found.availability.state, until: null, source: null }];
}));

const directory = [
  business("ac", "mechanic", 31.42, 73.09, "CONFIRMED", ["Car AC repair"]),
  business("ph", "pharmacy", 31.41, 73.08, "UNKNOWN", ["Prescription medicines"]),
  business("of", "office", 31.415, 73.075, "UNCONFIRMED", ["Document collection"]),
];

describe("trip workflow engine", () => {
  it("runs the spec example from request to a plan awaiting approval without any LLM", async () => {
    const store = memoryStore(directory);
    const { itinerary, stops } = await advanceWorkflow({ store, geo, availability: lookup(directory), now: () => new Date("2026-10-12T05:00:00Z") }, "trip");
    expect(itinerary.workflowState).toBe("AWAITING_APPROVAL");
    expect(stops.map((stop) => stop.placeLabel).sort()).toEqual(["Biz ac", "Biz of", "Biz ph"]);
    expect(itinerary.metrics.optimality).toBe("proven_optimal");
    expect(itinerary.metrics.estimateKind).toBe("straight_line");
    expect(itinerary.metrics.fuelCostPkr).toBeCloseTo((itinerary.metrics.distanceKm as number) / 12.5 * 250, 6);
    expect(itinerary.weights.timeWeightPkrPerMinute).toBe(0.5);
    // Uncertain stops get proposed confirmation requests; nothing is sent automatically.
    expect(store.actions.filter((action) => action.actionType === "send_confirmation_request").map((action) => action.payload.businessId).sort()).toEqual(["of", "ph"]);
    expect(store.actions.some((action) => action.actionType === "commit_trip")).toBe(true);
    expect(store.actions.every((action) => action.status === "proposed")).toBe(true);
    expect(store.logs).toEqual(expect.arrayContaining(["parse_request:succeeded", "search_candidates:succeeded", "verify_availability:succeeded", "route_matrix:succeeded", "estimate_fuel:succeeded", "optimize_itinerary:succeeded", "present_plan:waiting"]));
  });

  it("asks for missing essentials instead of guessing", async () => {
    const store = memoryStore(directory, { originLatitude: null, originLongitude: null });
    store.defaults = async () => ({ kmPerLitre: null, pricePkrPerLitre: null, priceSource: null, timeWeightPkrPerMinute: 2, failedVisitPenaltyPkr: 300, missedDeadlinePenaltyPkr: 500, maxTripMinutes: null });
    const { itinerary } = await advanceWorkflow({ store, geo, availability: lookup(directory) }, "trip");
    expect(itinerary.workflowState).toBe("NEEDS_INFO");
    expect((itinerary.metrics.questions as Array<{ key: string }>).map((question) => question.key)).toEqual(["origin", "efficiency", "fuel_price"]);
  });

  it("swaps a closed business for an available alternative and records why", async () => {
    // The search still lists the workshop as confirmed; the fresh availability check says it closed.
    const withClosed = [directory[0], business("ac2", "mechanic", 31.43, 73.1, "CONFIRMED", ["Car AC repair"]), directory[1], directory[2]];
    const store = memoryStore(withClosed);
    const availability: AvailabilityLookup = async (ids) => new Map(ids.map((id) => [id, { state: id === "ac" ? "TEMPORARILY_CLOSED" : "CONFIRMED", until: null, source: null }]));
    const { itinerary, stops } = await advanceWorkflow({ store, geo, availability }, "trip");
    expect(itinerary.workflowState).toBe("AWAITING_APPROVAL");
    expect((itinerary.metrics.swaps as Array<{ reason: string }>)[0].reason).toBe("TEMPORARILY_CLOSED");
    expect(stops.some((stop) => stop.businessId === "ac")).toBe(false);
  });

  it("explains an impossible plan and waits for the user", async () => {
    const store = memoryStore(directory, { maxTripMinutes: 10 });
    const { itinerary } = await advanceWorkflow({ store, geo, availability: lookup(directory) }, "trip");
    expect(itinerary.workflowState).toBe("NEEDS_INFO");
    expect((itinerary.metrics.diagnosis as { summary: string }).summary).toMatch(/maximum trip duration/);
    expect(store.logs).toContain("optimize_itinerary:failed");
  });

  it("recalculates from RECALCULATING back to a new proposal", async () => {
    const store = memoryStore(directory);
    await advanceWorkflow({ store, geo, availability: lookup(directory) }, "trip");
    const current = store.snapshot().itinerary;
    await store.transition(current, "RECALCULATING", { needsRecalculation: true });
    const { itinerary } = await advanceWorkflow({ store, geo, availability: lookup(directory) }, "trip");
    expect(itinerary.workflowState).toBe("AWAITING_APPROVAL");
    expect(itinerary.needsRecalculation).toBe(false);
    expect(store.logs).toContain("recalculate:succeeded");
    // No duplicate proposals on the second run.
    expect(store.actions.filter((action) => action.actionType === "send_confirmation_request")).toHaveLength(2);
  });

  it("asks when no business matches a mandatory errand", async () => {
    const store = memoryStore([], { requestText: "buy medicine" });
    const { itinerary } = await advanceWorkflow({ store, geo, availability: lookup([]) }, "trip");
    expect(itinerary.workflowState).toBe("NEEDS_INFO");
    expect((itinerary.metrics.questions as Array<{ key: string; label: string }>)[0]).toMatchObject({ key: "no_candidate", label: "Medicine" });
  });
});
