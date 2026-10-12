// Availability states for businesses (mirrors public.current_availability in SQL).
// Stored states come from authorised sources; UNKNOWN, PENDING_CONFIRMATION and EXPIRED are derived.

export const availabilityStates = [
  "UNKNOWN", "UNCONFIRMED", "PENDING_CONFIRMATION", "CONFIRMED", "UNAVAILABLE", "TEMPORARILY_CLOSED", "EXPIRED",
] as const;
export type AvailabilityState = (typeof availabilityStates)[number];

export const availabilitySources = [
  "business_dashboard", "appointment_accepted", "messaging", "manual_confirmation", "external_provider", "system",
] as const;
export type AvailabilitySource = (typeof availabilitySources)[number];

export type RiskLevel = "low" | "uncertain" | "blocked";

export function isAvailabilityState(value: unknown): value is AvailabilityState {
  return typeof value === "string" && (availabilityStates as readonly string[]).includes(value);
}

export function normaliseState(value: unknown): AvailabilityState {
  return isAvailabilityState(value) ? value : "UNKNOWN";
}

// How much a trip can rely on the state. Only CONFIRMED is low risk; published hours never are.
export function riskLevel(state: AvailabilityState): RiskLevel {
  if (state === "CONFIRMED") return "low";
  if (state === "UNAVAILABLE" || state === "TEMPORARILY_CLOSED") return "blocked";
  return "uncertain";
}

// Solver input: blocked stops are excluded (alternatives are offered); uncertain stops carry the
// user's failed-visit penalty so the optimiser prefers confirmed places when costs are close.
export function failedVisitPenaltyFor(state: AvailabilityState, penaltyPkr: number) {
  const risk = riskLevel(state);
  return risk === "low" ? 0 : risk === "uncertain" ? penaltyPkr : null;
}

export function canRequestConfirmation(state: AvailabilityState) {
  return state !== "PENDING_CONFIRMATION" && state !== "TEMPORARILY_CLOSED";
}

// Verification channels. Only providers with a supported integration may send; nothing is sent
// without the user's explicit action, and a missing integration is reported, never faked.
export type ChannelId = "in_app" | "manual" | "whatsapp";
export type ChannelStatus = { id: ChannelId; available: boolean; reason?: "not_configured" | "business_not_on_app" | "admin_only" };

export function confirmationChannels(input: { businessHasMembers: boolean; isAdmin: boolean; env?: Record<string, string | undefined> }): ChannelStatus[] {
  return [
    { id: "in_app", available: input.businessHasMembers, reason: input.businessHasMembers ? undefined : "business_not_on_app" },
    { id: "manual", available: input.isAdmin, reason: input.isAdmin ? undefined : "admin_only" },
    // WhatsApp Business needs a verified account, approved templates and a signed webhook;
    // until those exist the channel is shown as not configured rather than simulated.
    { id: "whatsapp", available: false, reason: "not_configured" },
  ];
}
