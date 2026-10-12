import { describe, expect, it } from "vitest";
import { rulesPredictor } from "./predictor";

describe("rules predictor", () => {
  it("returns facts, never a probability", () => {
    const prediction = rulesPredictor.predict({
      category: "pharmacy", weekday: 1, hourBucket: 10, availabilityState: "UNCONFIRMED",
      confirmationAgeMinutes: null, confirmationResponseMinutes: null, serviceReady: null, priorConfirmedVisits: 4, priorSuccessfulVisits: 3,
    });
    expect(prediction.kind).toBe("no_model");
    expect(prediction).not.toHaveProperty("probability");
    if (prediction.kind === "no_model") {
      expect(prediction.facts).toContain("3 of 4 earlier recorded visits succeeded.");
      expect(prediction.explanation).toMatch(/does not estimate a chance/);
    }
  });
});
