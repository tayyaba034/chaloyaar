import type { Evaluation, SolverProblem, SolverStop, Violation, VisitPlan } from "./model.ts";

// Earliest service start at or after `arrive` such that service fits inside a window.
export function earliestServiceStart(stop: SolverStop, arrive: number): number | null {
  if (stop.windows === null) return arrive;
  for (const window of stop.windows) {
    const start = Math.max(arrive, window.startMin);
    if (start + stop.serviceMinutes <= window.endMin) return start;
  }
  return null;
}

/**
 * Scores a given visiting order (a subset of stop indices, 1-based nodes). The single source of
 * truth for the objective: the exact solver, heuristic and "your order" comparison all use it.
 */
export function evaluateOrder(problem: SolverProblem, nodes: number[]): Evaluation {
  const { stops, distanceKm, durationMin, weights } = problem;
  let time = 0;
  let distance = 0;
  let travel = 0;
  let failedPenalty = 0;
  let missedDeadlines = 0;
  let previous = 0;
  let violation: Violation | null = null;
  const visits: VisitPlan[] = [];

  for (const node of nodes) {
    const stop = stops[node - 1];
    distance += distanceKm[previous][node];
    travel += durationMin[previous][node];
    const arrive = time + durationMin[previous][node];
    const start = earliestServiceStart(stop, arrive);
    if (start === null) {
      violation ??= { kind: "window", stopId: stop.id, arriveMin: arrive, windows: stop.windows ?? [] };
      time = arrive + stop.serviceMinutes;
    } else {
      const finish = start + stop.serviceMinutes;
      if (stop.hardDeadlineMin !== null && finish > stop.hardDeadlineMin) {
        violation ??= { kind: "hard_deadline", stopId: stop.id, finishMin: finish, deadlineMin: stop.hardDeadlineMin };
      }
      const missed = stop.softDeadlineMin !== null && finish > stop.softDeadlineMin;
      if (missed) missedDeadlines += 1;
      visits.push({ stopId: stop.id, arriveMin: arrive, waitMin: start - arrive, serviceStartMin: start, departMin: finish, missedSoftDeadline: missed });
      time = finish;
    }
    failedPenalty += stop.failedVisitPenaltyPkr;
    previous = node;
  }
  if (problem.returnToOrigin && nodes.length) {
    distance += distanceKm[previous][0];
    travel += durationMin[previous][0];
    time += durationMin[previous][0];
  }
  if (!violation && problem.maxTripMinutes !== null && time > problem.maxTripMinutes) {
    violation = { kind: "max_duration", totalMin: time, maxMin: problem.maxTripMinutes };
  }
  const visited = new Set(nodes);
  const skippedStops = stops.filter((_, index) => !visited.has(index + 1));
  const missingMandatory = skippedStops.find((stop) => stop.mandatory);
  if (!violation && missingMandatory) violation = { kind: "missing_mandatory", stopId: missingMandatory.id };
  const skipPenalty = skippedStops.reduce((sum, stop) => sum + stop.skipPenaltyPkr, 0);

  const fuelCostPkr = distance * weights.fuelCostPkrPerKm;
  const timeCostPkr = travel * weights.timeWeightPkrPerMinute;
  const missedDeadlinePenaltyPkr = missedDeadlines * weights.missedDeadlinePenaltyPkr;
  return {
    feasible: violation === null,
    order: nodes.map((node) => stops[node - 1].id),
    skipped: skippedStops.map((stop) => stop.id),
    visits,
    distanceKm: distance,
    travelMinutes: travel,
    totalMinutes: time,
    objective: {
      fuelCostPkr,
      timeCostPkr,
      failedVisitPenaltyPkr: failedPenalty,
      missedDeadlinePenaltyPkr,
      skipPenaltyPkr: skipPenalty,
      totalPkr: fuelCostPkr + timeCostPkr + failedPenalty + missedDeadlinePenaltyPkr + skipPenalty,
    },
    violation,
  };
}
