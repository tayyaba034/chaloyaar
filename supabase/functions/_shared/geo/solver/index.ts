import { evaluateOrder } from "./evaluate.ts";
import { EXACT_MAX_STOPS, solveExact } from "./exact.ts";
import { solveHeuristic } from "./heuristic.ts";
import type { Diagnosis, Evaluation, SolveResult, SolverProblem, Violation } from "./model.ts";
import { validateProblem } from "./model.ts";

export * from "./model.ts";
export { evaluateOrder } from "./evaluate.ts";
export { EXACT_MAX_STOPS } from "./exact.ts";

// Pluggable solver; an OR-Tools service could implement this interface later.
export interface ItinerarySolver {
  solve(problem: SolverProblem): SolveResult;
}

function run(problem: SolverProblem, timeLimitMs: number) {
  if (problem.stops.length <= EXACT_MAX_STOPS) {
    const result = solveExact(problem);
    return result ? { ...result, method: "exact" as const, optimality: "proven_optimal" as const } : null;
  }
  const result = solveHeuristic(problem, { timeLimitMs });
  return result ? { ...result, method: "heuristic" as const, optimality: "best_found" as const } : null;
}

export function solveItinerary(problem: SolverProblem, options: { timeLimitMs?: number } = {}): SolveResult {
  const invalid = validateProblem(problem);
  if (invalid) throw new RangeError(invalid);
  const timeLimitMs = options.timeLimitMs ?? 1500;
  const solved = run(problem, timeLimitMs);
  if (solved) return { status: "ok", best: solved.best, optimality: solved.optimality, method: solved.method, explored: solved.explored };
  return { status: "infeasible", diagnosis: diagnose(problem, timeLimitMs) };
}

export const defaultSolver: ItinerarySolver = { solve: (problem) => solveItinerary(problem) };

/**
 * Explains why no plan satisfies the hard constraints: direct-reachability checks per stop, then
 * single relaxations (drop max duration, relax one deadline, ignore one window, make one stop
 * optional) that would make a plan possible.
 */
export function diagnose(problem: SolverProblem, timeLimitMs = 1000): Diagnosis {
  const reasons: Violation[] = [];
  problem.stops.forEach((stop, index) => {
    if (!stop.mandatory) return;
    const direct = evaluateOrder({ ...problem, maxTripMinutes: null, stops: problem.stops.map((other) => ({ ...other, mandatory: false })) }, [index + 1]);
    if (direct.violation && direct.violation.kind !== "missing_mandatory") reasons.push(direct.violation);
  });
  if (problem.maxTripMinutes !== null) {
    const relaxed = run({ ...problem, maxTripMinutes: null }, timeLimitMs);
    if (relaxed && relaxed.best.totalMinutes > problem.maxTripMinutes) {
      reasons.push({ kind: "max_duration", totalMin: relaxed.best.totalMinutes, maxMin: problem.maxTripMinutes });
    }
  }

  const suggestions: Diagnosis["suggestions"] = [];
  const attempt = (change: Diagnosis["suggestions"][number]["change"], relaxed: SolverProblem, stopId?: string) => {
    const result = run(relaxed, timeLimitMs);
    if (result) suggestions.push({ change, stopId, resultingCostPkr: result.best.objective.totalPkr });
  };
  if (problem.maxTripMinutes !== null) attempt("drop_max_duration", { ...problem, maxTripMinutes: null });
  problem.stops.forEach((stop, index) => {
    const replace = (patch: Partial<typeof stop>) => ({ ...problem, stops: problem.stops.map((other, i) => (i === index ? { ...other, ...patch } : other)) });
    if (stop.hardDeadlineMin !== null) attempt("relax_hard_deadline", replace({ hardDeadlineMin: null, softDeadlineMin: stop.softDeadlineMin ?? stop.hardDeadlineMin }), stop.id);
    if (stop.windows !== null) attempt("ignore_window", replace({ windows: null }), stop.id);
    if (stop.mandatory) attempt("make_optional", replace({ mandatory: false }), stop.id);
  });
  suggestions.sort((a, b) => a.resultingCostPkr - b.resultingCostPkr);

  const first = reasons[0];
  const label = (stopId: string) => problem.stops.find((stop) => stop.id === stopId)?.label ?? stopId;
  const summary = !first
    ? suggestions.length ? "No single stop is impossible on its own, but the stops cannot all fit together." : "No plan satisfies the required stops and limits."
    : first.kind === "window" ? `${label(first.stopId)} cannot be reached while it is open, even if visited first.`
      : first.kind === "hard_deadline" ? `${label(first.stopId)} cannot be finished before its deadline, even if visited first.`
        : first.kind === "max_duration" ? "The required stops need more time than the maximum trip duration."
          : "A required stop cannot be included.";
  return { summary, reasons, suggestions: suggestions.slice(0, 4) };
}

export function compareOrders(problem: SolverProblem, userOrder: number[], best: Evaluation) {
  const original = evaluateOrder(problem, userOrder);
  return {
    original,
    optimized: best,
    savingsPkr: original.feasible ? original.objective.totalPkr - best.objective.totalPkr : null,
    savingsKm: original.distanceKm - best.distanceKm,
  };
}
