import { describe, expect, it } from "vitest";
import { parseRequest, timeWeightFor } from "./parse-request";
import { canTransition, transitions, workflowStates } from "./states";

describe("deterministic request parser", () => {
  it("understands the spec's example request", () => {
    const parsed = parseRequest("I need to get my car AC checked, buy medicine, and collect a document today. Plan the cheapest practical trip and verify that the places are available before I leave.");
    expect(parsed.errands.map((errand) => errand.label)).toEqual(["Car AC repair", "Medicine", "Collect document"]);
    expect(parsed.errands[0].categories).toEqual(["mechanic", "workshop"]);
    expect(parsed.preference).toBe("cheapest");
    expect(parsed.day).toBe("today");
    expect(parsed.unrecognised).toEqual([]);
  });

  it("reads deadlines, optional errands and time of day", () => {
    const parsed = parseRequest("Find a mechanic who can repair my car AC before 5, medicine in the evening, and laundry if possible");
    expect(parsed.errands[0].deadline).toEqual({ hour: 17, minute: 0, kind: "soft" });
    expect(parsed.errands[1].preferred).toEqual({ fromHour: 17, toHour: 21 });
    expect(parsed.errands[2]).toMatchObject({ label: "Laundry", mandatory: false });
  });

  it("handles Roman Urdu and Urdu", () => {
    const roman = parseRequest("Mujhe dawai leni hai aur mistri se gaari theek karwani hai 4 baje se pehle, sasta safar");
    expect(roman.errands.map((errand) => errand.label)).toEqual(["Medicine", "Mechanic"]);
    expect(roman.errands[1].deadline).toMatchObject({ hour: 16 });
    expect(roman.preference).toBe("cheapest");
    const urdu = parseRequest("دوائی لینی ہے اور کاغذ لینے ہیں، کل");
    expect(urdu.errands.map((errand) => errand.label)).toEqual(["Medicine", "Collect document"]);
    expect(urdu.day).toBe("tomorrow");
  });

  it("reports parts it did not understand and never invents errands", () => {
    const parsed = parseRequest("visit my aunt, buy medicine");
    expect(parsed.errands.map((errand) => errand.label)).toEqual(["Medicine"]);
    expect(parsed.unrecognised).toEqual(["visit my aunt"]);
    expect(parseRequest("").errands).toEqual([]);
  });

  it("maps preferences to time weights", () => {
    expect(timeWeightFor("cheapest", 2)).toBe(0.5);
    expect(timeWeightFor("fastest", 2)).toBe(6);
    expect(timeWeightFor("balanced", 2)).toBe(2);
  });
});

describe("workflow transitions", () => {
  it("only allows the documented transitions", () => {
    expect(canTransition("DRAFT", "PARSED")).toBe(true);
    expect(canTransition("DRAFT", "APPROVED")).toBe(false);
    expect(canTransition("AWAITING_APPROVAL", "APPROVED")).toBe(true);
    expect(transitions.COMPLETED).toEqual([]);
    for (const state of workflowStates) for (const next of transitions[state]) expect(workflowStates).toContain(next);
  });
});
