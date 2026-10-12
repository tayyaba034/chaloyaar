import { evaluateOrder } from "./evaluate.ts";
import type { Evaluation, SolverProblem } from "./model.ts";

const INFEASIBLE = 1e12;
const IMPROVEMENT = 1e-6;

const score = (evaluation: Evaluation) => (evaluation.feasible ? evaluation.objective.totalPkr : INFEASIBLE + evaluation.objective.totalPkr);

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/**
 * Multi-start local search: several constructions (tightest window first, nearest neighbour,
 * seeded random orders) each improved by relocate, segment move (or-opt), swap, 2-opt and
 * add/drop of optional stops. Keeps the best plan found within the time budget.
 * Not guaranteed optimal, and labelled "best found" for that reason.
 */
export function solveHeuristic(problem: SolverProblem, options: { timeLimitMs?: number; now?: () => number } = {}): { best: Evaluation; explored: number } | null {
  const now = options.now ?? (() => Date.now());
  const deadline = now() + (options.timeLimitMs ?? 1500);
  const n = problem.stops.length;
  let explored = 0;
  const evaluate = (nodes: number[]) => {
    explored += 1;
    return evaluateOrder(problem, nodes);
  };
  const nodes = Array.from({ length: n }, (_, index) => index + 1);
  const mandatory = nodes.filter((node) => problem.stops[node - 1].mandatory);
  const optional = nodes.filter((node) => !problem.stops[node - 1].mandatory);

  const bestInsertion = (route: number[], node: number) => {
    let best: { route: number[]; evaluation: Evaluation } | null = null;
    for (let position = 0; position <= route.length; position += 1) {
      const candidate = [...route.slice(0, position), node, ...route.slice(position)];
      const evaluation = evaluate(candidate);
      if (!best || score(evaluation) < score(best.evaluation)) best = { route: candidate, evaluation };
    }
    return best!;
  };

  const construct = (order: number[]) => {
    let route: number[] = [];
    let current = evaluate(route);
    for (const node of order.filter((value) => mandatory.includes(value))) ({ route, evaluation: current } = bestInsertion(route, node));
    for (const node of order.filter((value) => optional.includes(value))) {
      const attempt = bestInsertion(route, node);
      if (score(attempt.evaluation) < score(current)) ({ route, evaluation: current } = attempt);
    }
    return { route, current };
  };

  const improve = (start: { route: number[]; current: Evaluation }) => {
    let { route, current } = start;
    let improved = true;
    const accept = (candidate: number[]) => {
      const evaluation = evaluate(candidate);
      if (score(evaluation) < score(current) - IMPROVEMENT) {
        route = candidate;
        current = evaluation;
        improved = true;
      }
    };
    while (improved && now() < deadline) {
      improved = false;
      // Move a segment of 1–3 stops elsewhere (relocate / or-opt).
      for (let length = 1; length <= 3 && !improved; length += 1) {
        for (let from = 0; from + length <= route.length && !improved; from += 1) {
          const segment = route.slice(from, from + length);
          const rest = [...route.slice(0, from), ...route.slice(from + length)];
          for (let to = 0; to <= rest.length && !improved; to += 1) {
            if (to === from) continue;
            accept([...rest.slice(0, to), ...segment, ...rest.slice(to)]);
          }
        }
      }
      // Swap two stops, or reverse the segment between them (2-opt).
      for (let i = 0; i < route.length && !improved; i += 1) {
        for (let j = i + 1; j < route.length && !improved; j += 1) {
          const swapped = [...route];
          [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
          accept(swapped);
          if (!improved) accept([...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)]);
        }
      }
      // Drop a visited optional stop, or insert an unvisited one.
      for (const node of optional) {
        if (improved) break;
        if (route.includes(node)) accept(route.filter((value) => value !== node));
        else {
          const attempt = bestInsertion(route, node);
          if (score(attempt.evaluation) < score(current) - IMPROVEMENT) {
            route = attempt.route;
            current = attempt.evaluation;
            improved = true;
          }
        }
      }
    }
    return { route, current };
  };

  const windowEnd = (node: number) => {
    const stop = problem.stops[node - 1];
    return Math.min(stop.hardDeadlineMin ?? Infinity, ...(stop.windows ?? []).map((window) => window.endMin));
  };
  const nearestNeighbour = () => {
    const order: number[] = [];
    const left = new Set(nodes);
    let at = 0;
    while (left.size) {
      const next = [...left].sort((a, b) => problem.durationMin[at][a] - problem.durationMin[at][b])[0];
      order.push(next);
      left.delete(next);
      at = next;
    }
    return order;
  };
  const starts: Array<() => number[]> = [
    () => [...nodes].sort((a, b) => windowEnd(a) - windowEnd(b)),
    nearestNeighbour,
    () => [...nodes].sort((a, b) => problem.stops[b - 1].skipPenaltyPkr - problem.stops[a - 1].skipPenaltyPkr),
  ];
  const random = seededRandom(n * 7919 + 17);
  let best: Evaluation | null = null;
  for (let attempt = 0; attempt < 5000 && (attempt < starts.length || now() < deadline); attempt += 1) {
    const order = attempt < starts.length ? starts[attempt]() : [...nodes].sort(() => random() - 0.5);
    const result = improve(construct(order));
    if (!best || score(result.current) < score(best) - IMPROVEMENT) best = result.current;
    if (now() >= deadline) break;
  }
  return best?.feasible ? { best, explored } : null;
}
