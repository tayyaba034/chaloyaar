// Workflow states and allowed transitions. Mirrors public.validate_itinerary_transition in SQL,
// which enforces the same table in the database.
export const workflowStates = [
  "DRAFT", "PARSED", "NEEDS_INFO", "SEARCHING", "VERIFYING", "AWAITING_CONFIRMATION", "ROUTING", "OPTIMIZING",
  "PROPOSED", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS", "RECALCULATING", "COMPLETED", "CANCELLED", "FAILED",
] as const;
export type WorkflowState = (typeof workflowStates)[number];

export const transitions: Record<WorkflowState, WorkflowState[]> = {
  DRAFT: ["PARSED", "NEEDS_INFO", "CANCELLED", "FAILED"],
  PARSED: ["NEEDS_INFO", "SEARCHING", "CANCELLED", "FAILED"],
  NEEDS_INFO: ["PARSED", "SEARCHING", "CANCELLED", "FAILED"],
  SEARCHING: ["NEEDS_INFO", "VERIFYING", "CANCELLED", "FAILED"],
  VERIFYING: ["AWAITING_CONFIRMATION", "ROUTING", "NEEDS_INFO", "CANCELLED", "FAILED"],
  AWAITING_CONFIRMATION: ["VERIFYING", "ROUTING", "CANCELLED", "FAILED"],
  ROUTING: ["OPTIMIZING", "NEEDS_INFO", "CANCELLED", "FAILED"],
  OPTIMIZING: ["PROPOSED", "NEEDS_INFO", "CANCELLED", "FAILED"],
  PROPOSED: ["AWAITING_APPROVAL", "RECALCULATING", "NEEDS_INFO", "CANCELLED"],
  AWAITING_APPROVAL: ["APPROVED", "RECALCULATING", "PROPOSED", "NEEDS_INFO", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "RECALCULATING", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "RECALCULATING", "CANCELLED"],
  RECALCULATING: ["SEARCHING", "VERIFYING", "ROUTING", "OPTIMIZING", "PROPOSED", "NEEDS_INFO", "CANCELLED", "FAILED"],
  COMPLETED: [],
  CANCELLED: [],
  FAILED: ["DRAFT", "PARSED", "SEARCHING", "ROUTING", "CANCELLED"],
};

export function canTransition(from: WorkflowState, to: WorkflowState) {
  return from === to || transitions[from].includes(to);
}

// The 15 workflow steps from the product spec, as recorded in workflow_steps.step.
export const workflowSteps = [
  "parse_request", "identify_errands", "request_missing_info", "search_candidates", "verify_availability",
  "propose_confirmations", "route_matrix", "estimate_fuel", "optimize_itinerary", "evaluate_alternatives",
  "present_plan", "await_approval", "execute_action", "recalculate", "record_outcome",
] as const;
export type WorkflowStep = (typeof workflowSteps)[number];

// States where the engine stops and waits for a person or a business.
export const waitingStates: WorkflowState[] = ["NEEDS_INFO", "AWAITING_CONFIRMATION", "AWAITING_APPROVAL", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FAILED"];
