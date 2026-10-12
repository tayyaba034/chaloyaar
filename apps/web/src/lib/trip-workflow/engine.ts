import { costSensitivity, fuelCostPkrPerKm, tripFuelCost } from "@geo/cost.ts";
import { PKT_OFFSET_MINUTES, intersectWindows, minutesAfter, windowsForTrip, type TimeWindow } from "@geo/hours.ts";
import type { TravelMatrix } from "@geo/matrix.ts";
import { evaluateOrder, type SolverProblem, type SolverStop } from "@geo/solver/index.ts";
import { failedVisitPenaltyFor, riskLevel, type AvailabilityState } from "../availability-machine";
import type { BusinessCategory, BusinessSummary } from "../businesses";
import { parseRequest, timeWeightFor } from "./parse-request";
import { waitingStates, type WorkflowState } from "./states";
import type { Itinerary, Stop, StepLog, WorkflowGeo, WorkflowStore } from "./types";

export type AvailabilityLookup = (businessIds: string[]) => Promise<Map<string, { state: AvailabilityState; until: string | null; source: string | null }>>;
export type EngineDeps = { store: WorkflowStore; geo: WorkflowGeo; availability: AvailabilityLookup; now?: () => Date; actor?: "system" | "llm" | "user" };
export type Question = { key: "errands" | "origin" | "efficiency" | "fuel_price" | "no_candidate" | "infeasible"; stopId?: string; label?: string };

const DEFAULT_SKIP_PENALTY_PKR = 500;
const SEARCH_RADIUS_KM = 10;
const WIDE_RADIUS_KM = 25;

// Local date (Pakistan time) at a given hour, as an ISO instant.
export function localTime(base: Date, hour: number, minute = 0, dayOffset = 0) {
  const local = new Date(base.getTime() + PKT_OFFSET_MINUTES * 60_000);
  const utc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + dayOffset, hour, minute) - PKT_OFFSET_MINUTES * 60_000;
  return new Date(utc).toISOString();
}

function pickService(business: BusinessSummary, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
  return business.services.find((service) => words.some((word) => `${service.name} ${service.tag ?? ""}`.toLowerCase().includes(word))) ?? null;
}

const isBlocked = (state: AvailabilityState) => riskLevel(state) === "blocked";

/**
 * Runs workflow steps until the plan needs a person or a business (NEEDS_INFO, AWAITING_APPROVAL…).
 * Deterministic: search, rules, routing and optimisation. Nothing is sent to a business here;
 * confirmation requests and committing the trip are only proposed as pending actions.
 */
export async function advanceWorkflow(deps: EngineDeps, itineraryId: string) {
  const now = deps.now ?? (() => new Date());
  const actor = deps.actor ?? "system";
  const steps: StepLog[] = [];
  let loaded = await deps.store.load(itineraryId);
  if (!loaded) throw new Error("Itinerary not found.");
  let { itinerary, stops } = loaded;
  let matrix: (TravelMatrix & { engine: string; engineNote?: string }) | null = null;
  const log = async (entry: Omit<StepLog, "actor">) => {
    const full = { ...entry, actor };
    steps.push(full);
    await deps.store.logStep(itinerary.id, full);
  };
  const move = async (to: WorkflowState, patch: Partial<Itinerary> = {}) => {
    itinerary = await deps.store.transition(itinerary, to, patch);
  };
  const reload = async () => {
    loaded = await deps.store.load(itineraryId);
    if (!loaded) throw new Error("Itinerary not found.");
    ({ itinerary, stops } = loaded);
  };
  const activeStops = () => stops.filter((stop) => stop.status === "planned").sort((a, b) => a.position - b.position);
  const origin = () => (itinerary.originLatitude !== null && itinerary.originLongitude !== null ? { latitude: itinerary.originLatitude, longitude: itinerary.originLongitude } : null);
  const askFor = async (questions: Question[], extra: Record<string, unknown> = {}) => {
    const from = itinerary.workflowState;
    const metrics = { ...itinerary.metrics, questions, ...extra };
    if (from === "NEEDS_INFO") itinerary = await deps.store.update(itinerary, { metrics });
    else await move("NEEDS_INFO", { metrics });
    await log({ step: "request_missing_info", status: "waiting", from, to: "NEEDS_INFO", output: { questions: questions.map((question) => question.key) } });
  };

  for (let guard = 0; guard < 14; guard += 1) {
    const state = itinerary.workflowState;
    if (state === "DRAFT") {
      const parsed = parseRequest(itinerary.requestText ?? "");
      const defaults = await deps.store.defaults(itinerary.userId);
      const day = parsed.day === "tomorrow" ? 1 : 0;
      const departAt = itinerary.departAt ?? (day ? localTime(now(), 9, 0, 1) : new Date(Math.ceil(now().getTime() / 300_000) * 300_000).toISOString());
      if (!stops.length && parsed.errands.length) {
        stops = await deps.store.insertStops(itinerary.id, parsed.errands.map((errand, index) => ({
          position: index, userPosition: index, errandLabel: errand.label, category: errand.categories[0] ?? null, serviceQuery: errand.serviceQuery,
          businessId: null, serviceId: null, placeLabel: null, latitude: null, longitude: null, mandatory: errand.mandatory,
          deadlineAt: errand.deadline ? localTime(new Date(departAt), errand.deadline.hour, errand.deadline.minute) : null,
          deadlineKind: errand.deadline?.kind ?? "soft",
          preferredFrom: errand.preferred ? localTime(new Date(departAt), errand.preferred.fromHour) : null,
          preferredTo: errand.preferred ? localTime(new Date(departAt), errand.preferred.toHour) : null,
          serviceMinutes: 15, status: "planned", alternativeOf: null,
        })));
      }
      await log({ step: "parse_request", status: "succeeded", from: state, to: state, input: { textLength: (itinerary.requestText ?? "").length }, output: { errands: parsed.errands.map((errand) => errand.label), unrecognised: parsed.unrecognised, preference: parsed.preference, day: parsed.day } });
      await log({ step: "identify_errands", status: "succeeded", from: state, to: state, output: { stops: stops.map((stop) => ({ label: stop.errandLabel, mandatory: stop.mandatory, deadline: stop.deadlineAt, deadlineKind: stop.deadlineKind })) } });
      const weights = {
        timeWeightPkrPerMinute: timeWeightFor(parsed.preference, defaults.timeWeightPkrPerMinute),
        failedVisitPenaltyPkr: defaults.failedVisitPenaltyPkr,
        missedDeadlinePenaltyPkr: defaults.missedDeadlinePenaltyPkr,
        preference: parsed.preference,
        ...itinerary.weights,
      };
      const patch: Partial<Itinerary> = {
        departAt, weights, returnToOrigin: parsed.returnToOrigin,
        kmPerLitre: itinerary.kmPerLitre ?? defaults.kmPerLitre,
        pricePkrPerLitre: itinerary.pricePkrPerLitre ?? defaults.pricePkrPerLitre,
        maxTripMinutes: itinerary.maxTripMinutes ?? defaults.maxTripMinutes,
        metrics: { ...itinerary.metrics, unrecognised: parsed.unrecognised, priceSource: itinerary.pricePkrPerLitre ? "itinerary" : defaults.priceSource },
      };
      if (!stops.length) {
        itinerary = await deps.store.update(itinerary, patch);
        await askFor([{ key: "errands" }]);
        continue;
      }
      await move("PARSED", patch);
      continue;
    }

    if (state === "PARSED" || state === "NEEDS_INFO") {
      const questions: Question[] = [];
      if (!stops.length) questions.push({ key: "errands" });
      if (!origin()) questions.push({ key: "origin" });
      if (!itinerary.kmPerLitre) questions.push({ key: "efficiency" });
      if (!itinerary.pricePkrPerLitre) questions.push({ key: "fuel_price" });
      if (questions.length) {
        if (state === "NEEDS_INFO" && JSON.stringify(itinerary.metrics.questions) === JSON.stringify(questions)) break;
        await askFor(questions);
        break;
      }
      await move("SEARCHING", { metrics: { ...itinerary.metrics, questions: [], diagnosis: null } });
      continue;
    }

    if (state === "SEARCHING") {
      const near = origin()!;
      const alternatives: Record<string, unknown> = { ...(itinerary.metrics.alternatives as Record<string, unknown> | undefined) };
      const questions: Question[] = [];
      for (const stop of activeStops().filter((item) => !item.businessId && item.latitude === null)) {
        const categories = (stop.category ? [stop.category] : []) as BusinessCategory[];
        const query = stop.serviceQuery ?? stop.errandLabel;
        let candidates = await deps.store.searchBusinesses({ query, categories, near, radiusKm: SEARCH_RADIUS_KM });
        if (!candidates.length) candidates = await deps.store.searchBusinesses({ query, categories, near, radiusKm: WIDE_RADIUS_KM });
        if (!candidates.length && categories.length) candidates = await deps.store.searchBusinesses({ query: "", categories, near, radiusKm: WIDE_RADIUS_KM });
        alternatives[stop.id] = candidates.slice(0, 5).map((candidate) => ({ id: candidate.id, name: candidate.name, distanceKm: candidate.distanceKm, state: candidate.availability.state, isDemo: candidate.isDemo }));
        const pick = candidates.find((candidate) => !isBlocked(candidate.availability.state));
        if (pick) {
          const service = pickService(pick, query);
          const patch: Partial<Stop> = { businessId: pick.id, serviceId: service?.id ?? null, placeLabel: pick.name, latitude: pick.latitude, longitude: pick.longitude, category: pick.category, serviceMinutes: service?.durationMinutes ?? stop.serviceMinutes };
          await deps.store.updateStop(stop.id, patch);
          Object.assign(stop, patch);
        } else if (stop.mandatory) {
          questions.push({ key: "no_candidate", stopId: stop.id, label: stop.errandLabel });
        } else {
          await deps.store.updateStop(stop.id, { status: "skipped" });
          stop.status = "skipped";
        }
      }
      await log({ step: "search_candidates", status: questions.length ? "waiting" : "succeeded", from: state, to: state, output: { chosen: activeStops().map((stop) => stop.placeLabel), alternatives: Object.fromEntries(Object.entries(alternatives).map(([key, list]) => [key, (list as unknown[]).length])) } });
      itinerary = await deps.store.update(itinerary, { metrics: { ...itinerary.metrics, alternatives } });
      if (questions.length) {
        await askFor(questions);
        break;
      }
      await move("VERIFYING");
      continue;
    }

    if (state === "VERIFYING") {
      const businessIds = activeStops().flatMap((stop) => (stop.businessId ? [stop.businessId] : []));
      const availability = await deps.availability(businessIds);
      const swaps: Array<{ stop: string; from: string | null; to: string | null; reason: string }> = [];
      const questions: Question[] = [];
      for (const stop of activeStops()) {
        const current = stop.businessId ? availability.get(stop.businessId) : null;
        if (!current || !isBlocked(current.state)) continue;
        const near = origin()!;
        const candidates = (await deps.store.searchBusinesses({ query: stop.serviceQuery ?? stop.errandLabel, categories: stop.category ? [stop.category] : [], near, radiusKm: WIDE_RADIUS_KM }))
          .filter((candidate) => candidate.id !== stop.businessId && !isBlocked(candidate.availability.state));
        const replacement = candidates[0];
        if (replacement) {
          const service = pickService(replacement, stop.serviceQuery ?? stop.errandLabel);
          swaps.push({ stop: stop.errandLabel, from: stop.placeLabel, to: replacement.name, reason: current.state });
          const patch: Partial<Stop> = { businessId: replacement.id, serviceId: service?.id ?? null, placeLabel: replacement.name, latitude: replacement.latitude, longitude: replacement.longitude };
          await deps.store.updateStop(stop.id, patch);
          Object.assign(stop, patch);
          availability.set(replacement.id, { state: replacement.availability.state, until: replacement.availability.until, source: replacement.availability.source });
        } else if (stop.mandatory) {
          questions.push({ key: "no_candidate", stopId: stop.id, label: stop.errandLabel });
        } else {
          await deps.store.updateStop(stop.id, { status: "unavailable" });
          stop.status = "unavailable";
        }
      }
      // Uncertain stops: propose (never send) a confirmation request for the user to approve.
      const open = await deps.store.openActions(itinerary.id);
      const proposed: string[] = [];
      for (const stop of activeStops()) {
        const current = stop.businessId ? availability.get(stop.businessId) : null;
        if (!stop.businessId || !current || riskLevel(current.state) !== "uncertain" || current.state === "PENDING_CONFIRMATION") continue;
        if (open.some((action) => action.actionType === "send_confirmation_request" && action.payload.stopId === stop.id && ["proposed", "approved", "executed"].includes(action.status))) continue;
        await deps.store.proposeAction(itinerary, "send_confirmation_request", { businessId: stop.businessId, serviceId: stop.serviceId, stopId: stop.id, question: `Can you help with "${stop.errandLabel}" today?` }, `Ask ${stop.placeLabel} to confirm ${stop.errandLabel}`, "system");
        proposed.push(stop.placeLabel ?? stop.errandLabel);
      }
      const availabilityByStop = Object.fromEntries(activeStops().map((stop) => [stop.id, stop.businessId ? availability.get(stop.businessId) ?? null : null]));
      itinerary = await deps.store.update(itinerary, { metrics: { ...itinerary.metrics, availability: availabilityByStop, swaps } });
      await log({ step: "verify_availability", status: "succeeded", from: state, to: state, output: { states: Object.values(availabilityByStop).map((value) => value?.state ?? "CUSTOM_PLACE"), swaps } });
      await log({ step: "propose_confirmations", status: "succeeded", from: state, to: state, output: { proposed } });
      if (questions.length) {
        await askFor(questions);
        break;
      }
      await move("ROUTING");
      continue;
    }

    if (state === "ROUTING") {
      const points = [origin()!, ...activeStops().map((stop) => ({ latitude: stop.latitude!, longitude: stop.longitude! }))];
      matrix = await deps.geo.matrix(points);
      itinerary = await deps.store.update(itinerary, { metrics: { ...itinerary.metrics, routing: { estimateKind: matrix.estimateKind, providers: matrix.providers, notes: matrix.notes, engine: matrix.engine, engineNote: matrix.engineNote ?? null } } });
      await log({ step: "route_matrix", status: "succeeded", from: state, to: state, output: { points: points.length, estimateKind: matrix.estimateKind, providers: matrix.providers, engine: matrix.engine } });
      await move("OPTIMIZING");
      continue;
    }

    if (state === "OPTIMIZING") {
      const active = activeStops();
      const departAt = new Date(itinerary.departAt ?? now().toISOString());
      if (!matrix) matrix = await deps.geo.matrix([origin()!, ...active.map((stop) => ({ latitude: stop.latitude!, longitude: stop.longitude! }))]);
      const hours = await deps.store.businessHours(active.flatMap((stop) => (stop.businessId ? [stop.businessId] : [])));
      const availability = (itinerary.metrics.availability ?? {}) as Record<string, { state: AvailabilityState } | null>;
      const weights = { timeWeightPkrPerMinute: 2, failedVisitPenaltyPkr: 300, missedDeadlinePenaltyPkr: 500, ...itinerary.weights };
      const vehicle = { kmPerLitre: itinerary.kmPerLitre!, pricePkrPerLitre: itinerary.pricePkrPerLitre! };
      const solverStops: SolverStop[] = active.map((stop) => {
        const published = stop.businessId ? windowsForTrip(hours.get(stop.businessId) ?? [], departAt, 24 * 60) : null;
        const preferred: TimeWindow[] | null = stop.preferredFrom && stop.preferredTo ? [{ startMin: Math.max(0, minutesAfter(departAt, new Date(stop.preferredFrom))), endMin: minutesAfter(departAt, new Date(stop.preferredTo)) }] : null;
        const deadline = stop.deadlineAt ? minutesAfter(departAt, new Date(stop.deadlineAt)) : null;
        const state = availability[stop.id]?.state ?? (stop.businessId ? "UNKNOWN" : "UNCONFIRMED");
        return {
          id: stop.id, label: stop.placeLabel ?? stop.errandLabel, mandatory: stop.mandatory, serviceMinutes: stop.serviceMinutes,
          windows: intersectWindows(published, preferred),
          hardDeadlineMin: stop.deadlineKind === "hard" ? deadline : null,
          softDeadlineMin: stop.deadlineKind === "soft" ? deadline : null,
          failedVisitPenaltyPkr: failedVisitPenaltyFor(state, weights.failedVisitPenaltyPkr) ?? 0,
          skipPenaltyPkr: DEFAULT_SKIP_PENALTY_PKR,
        };
      });
      const problem: SolverProblem = {
        stops: solverStops,
        distanceKm: matrix.cells.map((row) => row.map((cell) => cell.distanceKm)),
        durationMin: matrix.cells.map((row) => row.map((cell) => cell.durationMin)),
        returnToOrigin: itinerary.returnToOrigin,
        maxTripMinutes: itinerary.maxTripMinutes,
        weights: { fuelCostPkrPerKm: fuelCostPkrPerKm(vehicle), timeWeightPkrPerMinute: weights.timeWeightPkrPerMinute, missedDeadlinePenaltyPkr: weights.missedDeadlinePenaltyPkr },
      };
      const userOrder = [...active].sort((a, b) => a.userPosition - b.userPosition).map((stop) => active.indexOf(stop) + 1);
      // "Keep my order": score the user's own order instead of optimising it.
      const optimized = itinerary.weights.keepUserOrder
        ? (() => {
          const evaluation = evaluateOrder(problem, userOrder);
          return evaluation.feasible
            ? { result: { status: "ok" as const, best: evaluation, optimality: "user_order" as const, method: "exact" as const, explored: 1 }, comparison: null, engine: "in_process" }
            : { result: { status: "infeasible" as const, diagnosis: { summary: "Your chosen order breaks a time limit. Let Chalo Yaar optimise the order, or change the limit.", reasons: evaluation.violation ? [evaluation.violation] : [], suggestions: [] } }, comparison: null, engine: "in_process" };
        })()
        : await deps.geo.optimize(problem, userOrder);
      if (optimized.result.status === "infeasible") {
        await log({ step: "optimize_itinerary", status: "failed", from: state, to: "NEEDS_INFO", output: { summary: optimized.result.diagnosis.summary } });
        await askFor([{ key: "infeasible" }], { diagnosis: optimized.result.diagnosis });
        break;
      }
      const best = optimized.result.best;
      const order = new Map(best.order.map((id, index) => [id, index]));
      const legs = [...best.order];
      const legDistances: Array<{ distanceKm: number; estimate: "road" | "straight_line" }> = [];
      let previous = 0;
      for (const id of legs) {
        const node = active.findIndex((stop) => stop.id === id) + 1;
        legDistances.push({ distanceKm: matrix.cells[previous][node].distanceKm, estimate: matrix.cells[previous][node].source === "straight_line" ? "straight_line" : "road" });
        previous = node;
      }
      if (itinerary.returnToOrigin && legs.length) legDistances.push({ distanceKm: matrix.cells[previous][0].distanceKm, estimate: matrix.cells[previous][0].source === "straight_line" ? "straight_line" : "road" });
      const fuel = tripFuelCost(legDistances, vehicle);
      await log({ step: "estimate_fuel", status: "succeeded", from: state, to: state, output: { distanceKm: Number(fuel.distanceKm.toFixed(2)), fuelLitres: Number(fuel.fuelLitres.toFixed(3)), fuelCostPkr: Math.round(fuel.fuelCostPkr), formula: "litres = km / km_per_litre; PKR = litres x price" } });
      const revisionStops = stops.map((stop) => {
        const visit = best.visits.find((item) => item.stopId === stop.id);
        const position = order.get(stop.id);
        return {
          id: stop.id,
          position: position ?? (best.order.length + stop.position),
          status: position === undefined && stop.status === "planned" ? "skipped" : stop.status,
          planned_arrival_at: visit ? new Date(departAt.getTime() + visit.serviceStartMin * 60_000).toISOString() : null,
          planned_departure_at: visit ? new Date(departAt.getTime() + visit.departMin * 60_000).toISOString() : null,
        };
      });
      const uncertain = active.filter((stop) => riskLevel(availability[stop.id]?.state ?? "UNKNOWN") === "uncertain" && order.has(stop.id)).map((stop) => stop.placeLabel ?? stop.errandLabel);
      const metrics = {
        ...itinerary.metrics,
        distanceKm: best.distanceKm, travelMinutes: best.travelMinutes, totalMinutes: best.totalMinutes,
        fuelLitres: fuel.fuelLitres, fuelCostPkr: fuel.fuelCostPkr, objective: best.objective,
        optimality: optimized.result.optimality, method: optimized.result.method, explored: optimized.result.explored,
        engine: optimized.engine, estimateKind: fuel.estimateKind === "none" ? matrix.estimateKind : fuel.estimateKind,
        assumptions: fuel.assumptions, sensitivity: costSensitivity(fuel.distanceKm, vehicle),
        comparison: optimized.comparison ? {
          originalOrder: optimized.comparison.original.order, originalFeasible: optimized.comparison.original.feasible,
          originalDistanceKm: optimized.comparison.original.distanceKm, originalTotalPkr: optimized.comparison.original.objective.totalPkr,
          originalViolation: optimized.comparison.original.violation, savingsPkr: optimized.comparison.savingsPkr, savingsKm: optimized.comparison.savingsKm,
        } : null,
        skipped: best.skipped, uncertainStops: uncertain,
        overPreferredCost: itinerary.preferredMaxCostPkr !== null && fuel.fuelCostPkr > itinerary.preferredMaxCostPkr,
        generatedAt: now().toISOString(),
      };
      const hadPlan = typeof itinerary.metrics.distanceKm === "number";
      const revision = await deps.store.saveRevision(itinerary, hadPlan ? (itinerary.needsRecalculation ? "recalculated" : "optimized") : "initial", revisionStops, metrics);
      await log({ step: "optimize_itinerary", status: "succeeded", from: state, to: state, output: { order: best.order.length, skipped: best.skipped.length, optimality: optimized.result.optimality, method: optimized.result.method, totalPkr: Math.round(best.objective.totalPkr), revision } });
      await reload();
      itinerary = await deps.store.update(itinerary, { metrics, needsRecalculation: false });
      await log({ step: "evaluate_alternatives", status: "succeeded", from: "OPTIMIZING", to: "PROPOSED", output: { uncertainStops: uncertain, alternativesKnown: Object.keys((itinerary.metrics.alternatives as object | undefined) ?? {}).length } });
      await move("PROPOSED");
      await move("AWAITING_APPROVAL");
      const open = await deps.store.openActions(itinerary.id);
      if (!open.some((action) => action.actionType === "commit_trip" && action.status === "proposed")) {
        await deps.store.proposeAction(itinerary, "commit_trip", { revision }, "Approve this plan and start the trip", "system");
      }
      await log({ step: "present_plan", status: "waiting", from: "PROPOSED", to: "AWAITING_APPROVAL", output: { revision } });
      break;
    }

    if (state === "RECALCULATING") {
      await log({ step: "recalculate", status: "succeeded", from: state, to: "SEARCHING", input: { reason: (itinerary.metrics.recalculationReason as string | undefined) ?? null } });
      await move("SEARCHING");
      continue;
    }

    if (waitingStates.includes(state) || state === "PROPOSED") break;
  }
  return { itinerary, stops: (await deps.store.load(itineraryId))?.stops ?? stops, steps };
}
