import type { BusinessCategory, BusinessSummary } from "../businesses";
import type { HoursRow } from "@geo/hours.ts";
import type { TravelMatrix } from "@geo/matrix.ts";
import type { SolverProblem } from "@geo/solver/index.ts";
import type { OptimizeResponse } from "../geo/client";
import type { WorkflowState, WorkflowStep } from "./states";

export type Itinerary = {
  id: string;
  userId: string;
  requestText: string | null;
  workflowState: WorkflowState;
  workflowVersion: number;
  originLabel: string | null;
  originLatitude: number | null;
  originLongitude: number | null;
  returnToOrigin: boolean;
  departAt: string | null;
  kmPerLitre: number | null;
  pricePkrPerLitre: number | null;
  maxTripMinutes: number | null;
  preferredMaxCostPkr: number | null;
  weights: { timeWeightPkrPerMinute?: number; failedVisitPenaltyPkr?: number; missedDeadlinePenaltyPkr?: number; preference?: string; keepUserOrder?: boolean };
  metrics: Record<string, unknown>;
  needsRecalculation: boolean;
  isDemo: boolean;
};

export type Stop = {
  id: string;
  position: number;
  userPosition: number;
  errandLabel: string;
  category: BusinessCategory | null;
  serviceQuery: string | null;
  businessId: string | null;
  serviceId: string | null;
  placeLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  mandatory: boolean;
  deadlineAt: string | null;
  deadlineKind: "hard" | "soft";
  preferredFrom: string | null;
  preferredTo: string | null;
  serviceMinutes: number;
  status: "planned" | "skipped" | "unavailable" | "visited" | "failed";
  alternativeOf: string | null;
};

export type NewStop = Omit<Stop, "id">;

export type StepLog = { step: WorkflowStep; status: "succeeded" | "waiting" | "failed" | "skipped"; actor: "system" | "llm" | "user"; from: WorkflowState; to: WorkflowState; input?: Record<string, unknown>; output?: Record<string, unknown>; error?: string };

export type ActionType = "send_confirmation_request" | "request_appointment" | "commit_trip";

export interface WorkflowStore {
  load(id: string): Promise<{ itinerary: Itinerary; stops: Stop[] } | null>;
  // Compare-and-set on workflow_version; throws WorkflowConflict when another request moved it.
  transition(itinerary: Itinerary, to: WorkflowState, patch?: Partial<Itinerary>): Promise<Itinerary>;
  update(itinerary: Itinerary, patch: Partial<Itinerary>): Promise<Itinerary>;
  insertStops(itineraryId: string, stops: NewStop[]): Promise<Stop[]>;
  updateStop(stopId: string, patch: Partial<Stop>): Promise<void>;
  logStep(itineraryId: string, log: StepLog): Promise<void>;
  searchBusinesses(params: { query: string; categories: BusinessCategory[]; near: { latitude: number; longitude: number }; radiusKm: number }): Promise<BusinessSummary[]>;
  businessHours(businessIds: string[]): Promise<Map<string, HoursRow[]>>;
  defaults(userId: string): Promise<{ kmPerLitre: number | null; pricePkrPerLitre: number | null; priceSource: string | null; timeWeightPkrPerMinute: number; failedVisitPenaltyPkr: number; missedDeadlinePenaltyPkr: number; maxTripMinutes: number | null }>;
  proposeAction(itinerary: Itinerary, type: ActionType, payload: Record<string, unknown>, summary: string, proposedBy: "agent" | "system" | "user"): Promise<void>;
  openActions(itineraryId: string): Promise<Array<{ id: string; actionType: ActionType; payload: Record<string, unknown>; status: string }>>;
  saveRevision(itinerary: Itinerary, reason: "initial" | "optimized" | "user_edit" | "recalculated" | "alternative", stops: Array<{ id: string; position: number; status: string; planned_arrival_at: string | null; planned_departure_at: string | null }>, metrics: Record<string, unknown>): Promise<number>;
}

export interface WorkflowGeo {
  matrix(points: Array<{ latitude: number; longitude: number }>): Promise<TravelMatrix & { engine: string; engineNote?: string }>;
  optimize(problem: SolverProblem, userOrder: number[]): Promise<OptimizeResponse & { engine: string; engineNote?: string }>;
}

export class WorkflowConflict extends Error {
  constructor() {
    super("The trip changed in another window. Reload to see the latest plan.");
    this.name = "WorkflowConflict";
  }
}
