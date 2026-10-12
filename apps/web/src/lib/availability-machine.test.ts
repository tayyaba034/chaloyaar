import { describe, expect, it } from "vitest";
import { availabilityStates, canRequestConfirmation, confirmationChannels, failedVisitPenaltyFor, normaliseState, riskLevel } from "./availability-machine";

describe("availability state machine helpers", () => {
  it("treats only CONFIRMED as low risk", () => {
    expect(availabilityStates.filter((state) => riskLevel(state) === "low")).toEqual(["CONFIRMED"]);
    expect(riskLevel("UNKNOWN")).toBe("uncertain");
    expect(riskLevel("EXPIRED")).toBe("uncertain");
    expect(riskLevel("PENDING_CONFIRMATION")).toBe("uncertain");
    expect(riskLevel("TEMPORARILY_CLOSED")).toBe("blocked");
  });

  it("maps states to solver penalties and exclusions", () => {
    expect(failedVisitPenaltyFor("CONFIRMED", 300)).toBe(0);
    expect(failedVisitPenaltyFor("UNCONFIRMED", 300)).toBe(300);
    expect(failedVisitPenaltyFor("UNAVAILABLE", 300)).toBeNull();
  });

  it("normalises unknown values and blocks duplicate requests", () => {
    expect(normaliseState("maybe")).toBe("UNKNOWN");
    expect(canRequestConfirmation("PENDING_CONFIRMATION")).toBe(false);
    expect(canRequestConfirmation("EXPIRED")).toBe(true);
  });

  it("never offers a channel that is not integrated", () => {
    const channels = confirmationChannels({ businessHasMembers: false, isAdmin: false, env: {} });
    expect(channels.filter((channel) => channel.available)).toEqual([]);
    expect(channels.find((channel) => channel.id === "in_app")?.reason).toBe("business_not_on_app");
    expect(confirmationChannels({ businessHasMembers: true, isAdmin: true, env: { WHATSAPP_CLOUD_TOKEN: "x" } }).find((c) => c.id === "whatsapp")?.available).toBe(false);
  });
});
