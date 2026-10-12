import { describe, expect, it } from "vitest";
import { compareOrders, diagnose, evaluateOrder, solveItinerary, type SolverProblem, type SolverStop } from "@geo/solver/index.ts";
import { solveExact } from "@geo/solver/exact.ts";
import { solveHeuristic } from "@geo/solver/heuristic.ts";

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const stop = (id: string, patch: Partial<SolverStop> = {}): SolverStop => ({
  id, label: id, mandatory: true, serviceMinutes: 10, windows: null,
  hardDeadlineMin: null, softDeadlineMin: null, failedVisitPenaltyPkr: 0, skipPenaltyPkr: 0, ...patch,
});

function randomProblem(seed: number, n: number): SolverProblem {
  const random = rng(seed);
  const points = Array.from({ length: n + 1 }, () => ({ x: random() * 10, y: random() * 10 }));
  const distanceKm = points.map((a) => points.map((b) => Math.hypot(a.x - b.x, a.y - b.y) * (1 + random() * 0.2)));
  const durationMin = distanceKm.map((row) => row.map((km) => km * 2.4));
  const stops = Array.from({ length: n }, (_, index) => {
    const opens = Math.floor(random() * 120);
    return stop(`s${index}`, {
      mandatory: random() > 0.3,
      serviceMinutes: 5 + Math.floor(random() * 20),
      windows: random() > 0.4 ? [{ startMin: opens, endMin: opens + 90 + Math.floor(random() * 200) }] : null,
      softDeadlineMin: random() > 0.7 ? 60 + Math.floor(random() * 200) : null,
      failedVisitPenaltyPkr: random() > 0.5 ? 50 : 0,
      skipPenaltyPkr: 100 + Math.floor(random() * 400),
    });
  });
  return {
    stops, distanceKm, durationMin, returnToOrigin: random() > 0.5,
    maxTripMinutes: random() > 0.7 ? 300 : null,
    weights: { fuelCostPkrPerKm: 20, timeWeightPkrPerMinute: 3, missedDeadlinePenaltyPkr: 200 },
  };
}

function bruteForce(problem: SolverProblem) {
  const n = problem.stops.length;
  let best: ReturnType<typeof evaluateOrder> | null = null;
  const permute = (prefix: number[], remaining: number[]) => {
    const evaluation = evaluateOrder(problem, prefix);
    if (evaluation.feasible && (!best || evaluation.objective.totalPkr < best.objective.totalPkr - 1e-9)) best = evaluation;
    remaining.forEach((node, index) => permute([...prefix, node], [...remaining.slice(0, index), ...remaining.slice(index + 1)]));
  };
  permute([], Array.from({ length: n }, (_, index) => index + 1));
  return best as ReturnType<typeof evaluateOrder> | null;
}

const line = (n: number): SolverProblem => {
  // Origin at 0, stops at km 1..n along a straight road.
  const positions = [0, ...Array.from({ length: n }, (_, index) => index + 1)];
  const distanceKm = positions.map((a) => positions.map((b) => Math.abs(a - b)));
  return {
    stops: Array.from({ length: n }, (_, index) => stop(`p${index + 1}`)),
    distanceKm,
    durationMin: distanceKm.map((row) => row.map((km) => km * 3)),
    returnToOrigin: false,
    maxTripMinutes: null,
    weights: { fuelCostPkrPerKm: 20, timeWeightPkrPerMinute: 2, missedDeadlinePenaltyPkr: 300 },
  };
};

describe("itinerary solver", () => {
  it("matches brute force on random instances (exact search is optimal for the model)", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const problem = randomProblem(seed, 1 + (seed % 6));
      const exact = solveExact(problem);
      const brute = bruteForce(problem);
      expect(Boolean(exact), `seed ${seed} feasibility`).toBe(Boolean(brute));
      if (exact && brute) expect(exact.best.objective.totalPkr, `seed ${seed}`).toBeCloseTo(brute.objective.totalPkr, 6);
    }
  });

  it("keeps the heuristic close to the exact optimum", () => {
    let compared = 0;
    for (let seed = 100; seed < 140; seed += 1) {
      const problem = randomProblem(seed, 7 + (seed % 3));
      const exact = solveExact(problem);
      const heuristic = solveHeuristic(problem, { timeLimitMs: 150 });
      if (!exact) continue;
      compared += 1;
      expect(heuristic, `seed ${seed} heuristic found a plan`).not.toBeNull();
      expect(heuristic!.best.objective.totalPkr).toBeLessThanOrEqual(exact.best.objective.totalPkr * 1.15 + 1);
    }
    expect(compared).toBeGreaterThan(10);
  }, 30000);

  it("orders stops along a road and reports proven optimality", () => {
    const problem = line(4);
    const result = solveItinerary(problem);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.best.order).toEqual(["p1", "p2", "p3", "p4"]);
    expect(result.optimality).toBe("proven_optimal");
    expect(result.best.distanceKm).toBe(4);
    expect(result.best.objective.fuelCostPkr).toBe(80);
    expect(result.best.objective.timeCostPkr).toBe(24);
  });

  it("waits for opening hours and respects windows", () => {
    const problem = line(2);
    problem.stops[0].windows = [{ startMin: 60, endMin: 120 }];
    const result = solveItinerary(problem);
    if (result.status !== "ok") throw new Error("expected a plan");
    const first = result.best.visits.find((visit) => visit.stopId === "p1")!;
    expect(first.serviceStartMin).toBeGreaterThanOrEqual(60);
    expect(result.best.visits.every((visit) => visit.serviceStartMin + 10 <= 120 || visit.stopId !== "p1")).toBe(true);
  });

  it("puts a closing-soon stop first even when it is farther", () => {
    const problem = line(3);
    problem.stops[2].windows = [{ startMin: 0, endMin: 20 }];
    const result = solveItinerary(problem);
    if (result.status !== "ok") throw new Error("expected a plan");
    expect(result.best.order[0]).toBe("p3");
  });

  it("drops an optional stop when its skip penalty is cheaper than the detour", () => {
    const problem = line(3);
    problem.stops[2] = { ...problem.stops[2], mandatory: false, skipPenaltyPkr: 10 };
    const result = solveItinerary(problem);
    if (result.status !== "ok") throw new Error("expected a plan");
    expect(result.best.skipped).toEqual(["p3"]);
    expect(result.best.objective.skipPenaltyPkr).toBe(10);
  });

  it("charges soft deadline misses but treats hard deadlines as constraints", () => {
    const soft = line(2);
    soft.stops[1].softDeadlineMin = 1;
    const softResult = solveItinerary(soft);
    expect(softResult.status === "ok" && softResult.best.objective.missedDeadlinePenaltyPkr).toBe(300);
    const hard = line(1);
    hard.stops[0].hardDeadlineMin = 5;
    const hardResult = solveItinerary(hard);
    expect(hardResult.status).toBe("infeasible");
  });

  it("explains infeasibility with the blocking constraint", () => {
    const problem = line(3);
    problem.stops[2].windows = [{ startMin: 0, endMin: 5 }];
    const result = solveItinerary(problem);
    expect(result.status).toBe("infeasible");
    if (result.status !== "infeasible") return;
    expect(result.diagnosis.reasons[0]).toMatchObject({ kind: "window", stopId: "p3" });
    expect(result.diagnosis.summary).toMatch(/p3 cannot be reached while it is open/);
    expect(result.diagnosis.suggestions.map((suggestion) => suggestion.change)).toEqual(expect.arrayContaining(["ignore_window", "make_optional"]));
  });

  it("reports a maximum duration that is too short", () => {
    const problem = { ...line(3), maxTripMinutes: 20 };
    const diagnosis = diagnose(problem);
    expect(diagnosis.reasons.some((reason) => reason.kind === "max_duration")).toBe(true);
    expect(diagnosis.suggestions[0].change).toBe("drop_max_duration");
  });

  it("compares the user's order with the optimised order", () => {
    const problem = line(3);
    const result = solveItinerary(problem);
    if (result.status !== "ok") throw new Error("expected a plan");
    const comparison = compareOrders(problem, [3, 1, 2], result.best);
    expect(comparison.original.distanceKm).toBe(6);
    expect(comparison.savingsKm).toBe(3);
    expect(comparison.savingsPkr).toBeGreaterThan(0);
  });

  it("uses the heuristic above the exact limit and labels it", () => {
    const random = rng(7);
    const n = 14;
    const points = Array.from({ length: n + 1 }, () => [random() * 10, random() * 10]);
    const distanceKm = points.map((a) => points.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])));
    const problem: SolverProblem = {
      stops: Array.from({ length: n }, (_, index) => stop(`h${index}`)),
      distanceKm, durationMin: distanceKm.map((row) => row.map((km) => km * 2)),
      returnToOrigin: true, maxTripMinutes: null,
      weights: { fuelCostPkrPerKm: 20, timeWeightPkrPerMinute: 1, missedDeadlinePenaltyPkr: 0 },
    };
    const result = solveItinerary(problem, { timeLimitMs: 500 });
    expect(result.status === "ok" && result.optimality).toBe("best_found");
  });

  it("handles an empty trip and rejects malformed input", () => {
    expect(solveItinerary({ ...line(0) })).toMatchObject({ status: "ok", best: { order: [], distanceKm: 0 } });
    const bad = line(2);
    bad.distanceKm[0][1] = -1;
    expect(() => solveItinerary(bad)).toThrow(/non-negative/);
  });
});
