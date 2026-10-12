// Interface for a future availability model. Until a model is trained on real, labelled outcomes
// and shown to beat a simple baseline, only RulesPredictor exists and it never returns a
// probability: it returns facts and a plain explanation of the uncertainty.
import type { AvailabilityState } from "./availability-machine";
import { riskLevel } from "./availability-machine";

export type VisitFeatures = {
  category: string;
  weekday: number;
  hourBucket: number;
  availabilityState: AvailabilityState;
  confirmationAgeMinutes: number | null;
  confirmationResponseMinutes: number | null;
  serviceReady: boolean | null;
  priorConfirmedVisits: number;
  priorSuccessfulVisits: number;
};

export type Prediction =
  | { kind: "no_model"; facts: string[]; explanation: string }
  | { kind: "model"; probability: number; modelVersion: string; baselineComparison: { baseline: string; metric: string; model: number; baselineValue: number } };

export interface AvailabilityPredictor {
  readonly id: string;
  predict(features: VisitFeatures): Prediction;
}

export const rulesPredictor: AvailabilityPredictor = {
  id: "rules-v1",
  predict(features) {
    const facts: string[] = [];
    if (features.confirmationAgeMinutes !== null) facts.push(`Last confirmation ${features.confirmationAgeMinutes} minutes before departure.`);
    if (features.confirmationResponseMinutes !== null) facts.push(`The business answered in ${features.confirmationResponseMinutes} minutes.`);
    if (features.serviceReady !== null) facts.push(features.serviceReady ? "The business reported the part or service ready." : "The business reported the part or service not ready.");
    facts.push(features.priorConfirmedVisits === 0 ? "No earlier visits recorded for this business." : `${features.priorSuccessfulVisits} of ${features.priorConfirmedVisits} earlier recorded visits succeeded.`);
    const risk = riskLevel(features.availabilityState);
    const explanation = risk === "low"
      ? "Confirmed recently by the business. Things can still change; no success rate is estimated."
      : risk === "blocked"
        ? "The business reported it cannot help."
        : "Not confirmed. Chalo Yaar does not estimate a chance of success without a validated model.";
    return { kind: "no_model", facts, explanation };
  },
};
