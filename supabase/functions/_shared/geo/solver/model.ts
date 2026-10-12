import type { TimeWindow } from "../hours.ts";

// Node 0 is the origin; stops are nodes 1..n in the matrices.
export type SolverStop = {
  id: string;
  label: string;
  mandatory: boolean;
  serviceMinutes: number;
  // Allowed service windows (minutes after departure). null = unconstrained; [] = never possible.
  windows: TimeWindow[] | null;
  // Service must finish by this minute (hard) or a penalty applies (soft).
  hardDeadlineMin: number | null;
  softDeadlineMin: number | null;
  // Added when the stop is visited while availability is not confirmed (PKR).
  failedVisitPenaltyPkr: number;
  // Added when an optional stop is dropped (PKR).
  skipPenaltyPkr: number;
};

export type ObjectiveWeights = {
  fuelCostPkrPerKm: number;
  timeWeightPkrPerMinute: number;
  missedDeadlinePenaltyPkr: number;
};

export type SolverProblem = {
  stops: SolverStop[];
  distanceKm: number[][]; // (n+1)×(n+1), node 0 = origin
  durationMin: number[][];
  returnToOrigin: boolean;
  maxTripMinutes: number | null;
  weights: ObjectiveWeights;
};

export type ObjectiveBreakdown = {
  fuelCostPkr: number;
  timeCostPkr: number;
  failedVisitPenaltyPkr: number;
  missedDeadlinePenaltyPkr: number;
  skipPenaltyPkr: number;
  totalPkr: number;
};

export type VisitPlan = {
  stopId: string;
  arriveMin: number;
  waitMin: number;
  serviceStartMin: number;
  departMin: number;
  missedSoftDeadline: boolean;
};

export type Violation =
  | { kind: "window"; stopId: string; arriveMin: number; windows: TimeWindow[] }
  | { kind: "hard_deadline"; stopId: string; finishMin: number; deadlineMin: number }
  | { kind: "max_duration"; totalMin: number; maxMin: number }
  | { kind: "missing_mandatory"; stopId: string };

export type Evaluation = {
  feasible: boolean;
  order: string[];
  skipped: string[];
  visits: VisitPlan[];
  distanceKm: number;
  travelMinutes: number;
  totalMinutes: number;
  objective: ObjectiveBreakdown;
  violation: Violation | null;
};

export type Optimality = "proven_optimal" | "best_found" | "user_order";

export type SolveResult =
  | { status: "ok"; best: Evaluation; optimality: Optimality; method: "exact" | "heuristic"; explored: number }
  | { status: "infeasible"; diagnosis: Diagnosis };

export type Diagnosis = {
  summary: string;
  reasons: Violation[];
  // Single relaxations that would make a plan possible, most helpful first.
  suggestions: Array<{ change: "drop_max_duration" | "relax_hard_deadline" | "ignore_window" | "make_optional"; stopId?: string; resultingCostPkr: number }>;
};

export function validateProblem(problem: SolverProblem): string | null {
  const size = problem.stops.length + 1;
  const square = (matrix: number[][]) => matrix.length === size && matrix.every((row) => row.length === size && row.every((value) => Number.isFinite(value) && value >= 0));
  if (!square(problem.distanceKm) || !square(problem.durationMin)) return "Travel matrices must be square, finite and non-negative.";
  if (new Set(problem.stops.map((stop) => stop.id)).size !== problem.stops.length) return "Stop ids must be unique.";
  for (const stop of problem.stops) {
    if (!Number.isFinite(stop.serviceMinutes) || stop.serviceMinutes < 0) return `Service time for ${stop.label} must be zero or more minutes.`;
    if (stop.failedVisitPenaltyPkr < 0 || stop.skipPenaltyPkr < 0) return "Penalties cannot be negative.";
  }
  const { fuelCostPkrPerKm, timeWeightPkrPerMinute, missedDeadlinePenaltyPkr } = problem.weights;
  if ([fuelCostPkrPerKm, timeWeightPkrPerMinute, missedDeadlinePenaltyPkr].some((value) => !Number.isFinite(value) || value < 0)) return "Weights must be zero or positive numbers.";
  if (problem.maxTripMinutes !== null && !(problem.maxTripMinutes > 0)) return "Maximum trip duration must be positive.";
  return null;
}
