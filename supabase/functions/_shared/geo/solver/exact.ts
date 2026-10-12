import { earliestServiceStart, evaluateOrder } from "./evaluate.ts";
import type { Evaluation, SolverProblem } from "./model.ts";

export const EXACT_MAX_STOPS = 10;
const EPSILON = 1e-9;

type Label = { time: number; cost: number; node: number; parent: Label | null };

/**
 * Exact search (label-setting dynamic programming over visited-set × last stop).
 * Waiting is allowed, so arriving earlier is never worse; a label that is no later and no more
 * expensive than another dominates it. The result is optimal for this cost model and matrix.
 * Returns null when no feasible plan exists.
 */
export function solveExact(problem: SolverProblem): { best: Evaluation; explored: number } | null {
  const n = problem.stops.length;
  if (n > EXACT_MAX_STOPS) throw new RangeError(`Exact search supports at most ${EXACT_MAX_STOPS} stops.`);
  const { stops, distanceKm, durationMin, weights } = problem;
  const mandatoryMask = stops.reduce((mask, stop, index) => (stop.mandatory ? mask | (1 << index) : mask), 0);
  const returnMinutes = (node: number) => (problem.returnToOrigin ? durationMin[node][0] : 0);
  const states = new Map<number, Label[]>();
  const key = (mask: number, last: number) => mask * (n + 1) + last;
  let explored = 0;

  const insert = (stateKey: number, label: Label) => {
    const labels = states.get(stateKey) ?? [];
    if (labels.some((other) => other.time <= label.time + EPSILON && other.cost <= label.cost + EPSILON)) return;
    states.set(stateKey, [...labels.filter((other) => !(label.time <= other.time + EPSILON && label.cost <= other.cost + EPSILON)), label]);
    explored += 1;
  };
  insert(key(0, 0), { time: 0, cost: 0, node: 0, parent: null });

  for (let mask = 0; mask < 1 << n; mask += 1) {
    for (let last = 0; last <= n; last += 1) {
      const labels = states.get(key(mask, last));
      if (!labels) continue;
      for (const label of labels) {
        for (let index = 0; index < n; index += 1) {
          if (mask & (1 << index)) continue;
          const node = index + 1;
          const stop = stops[index];
          const arrive = label.time + durationMin[last][node];
          const start = earliestServiceStart(stop, arrive);
          if (start === null) continue;
          const finish = start + stop.serviceMinutes;
          if (stop.hardDeadlineMin !== null && finish > stop.hardDeadlineMin + EPSILON) continue;
          if (problem.maxTripMinutes !== null && finish + returnMinutes(node) > problem.maxTripMinutes + EPSILON) continue;
          const missed = stop.softDeadlineMin !== null && finish > stop.softDeadlineMin + EPSILON;
          const cost = label.cost
            + distanceKm[last][node] * weights.fuelCostPkrPerKm
            + durationMin[last][node] * weights.timeWeightPkrPerMinute
            + stop.failedVisitPenaltyPkr
            + (missed ? weights.missedDeadlinePenaltyPkr : 0);
          insert(key(mask | (1 << index), node), { time: finish, cost, node, parent: label });
        }
      }
    }
  }

  let best: { label: Label; total: number } | null = null;
  for (const [stateKey, labels] of states) {
    const mask = Math.floor(stateKey / (n + 1));
    if ((mask & mandatoryMask) !== mandatoryMask) continue;
    const last = stateKey % (n + 1);
    if (mask === 0 && n > 0 && mandatoryMask !== 0) continue;
    const skipPenalty = stops.reduce((sum, stop, index) => (mask & (1 << index) ? sum : sum + stop.skipPenaltyPkr), 0);
    for (const label of labels) {
      const back = problem.returnToOrigin && mask !== 0;
      const endTime = label.time + (back ? durationMin[last][0] : 0);
      if (problem.maxTripMinutes !== null && endTime > problem.maxTripMinutes + EPSILON) continue;
      const total = label.cost + skipPenalty
        + (back ? distanceKm[last][0] * weights.fuelCostPkrPerKm + durationMin[last][0] * weights.timeWeightPkrPerMinute : 0);
      if (!best || total < best.total - EPSILON) best = { label, total };
    }
  }
  if (!best) return null;
  const nodes: number[] = [];
  for (let label: Label | null = best.label; label && label.node !== 0; label = label.parent) nodes.unshift(label.node);
  const evaluation = evaluateOrder(problem, nodes);
  return { best: evaluation, explored };
}
