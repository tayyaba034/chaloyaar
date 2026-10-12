import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./service", () => ({ loadItinerary: vi.fn(), reopenForChanges: vi.fn(), runWorkflow: vi.fn() }));
import { numbersGrounded, plannerTools, runPlannerTool } from "./agent-tools";

describe("planner agent tools", () => {
  it("exposes exactly the spec's tools with JSON schemas", () => {
    expect(plannerTools.map((tool) => tool.spec.name)).toEqual([
      "search_businesses", "get_business_details", "request_availability_confirmation", "check_confirmation_status", "get_route_matrix",
      "calculate_fuel_cost", "optimize_itinerary", "find_alternatives", "save_itinerary", "record_trip_outcome",
    ]);
    expect(plannerTools.every((tool) => (tool.spec.parameters as { type?: string }).type === "object")).toBe(true);
  });

  it("rejects invalid arguments before touching data", async () => {
    const access = { supabase: {} as never, profile: { id: "u" } };
    expect(await runPlannerTool(access, "t", "get_business_details", { businessId: "not-a-uuid" })).toMatchObject({ error: "Invalid arguments." });
    expect(await runPlannerTool(access, "t", "drop_tables", {})).toEqual({ error: "Unknown tool." });
  });

  it("only proposes confirmation requests (never sends)", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const access = { supabase: { from: () => ({ insert }) } as never, profile: { id: "u" } };
    const result = await runPlannerTool(access, "11111111-1111-4111-8111-111111111111", "request_availability_confirmation", { businessId: "22222222-2222-4222-8222-222222222222", question: "AC repair today?" });
    expect(result).toEqual({ proposed: true, sent: false, note: "Waiting for the user's approval." });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ action_type: "send_confirmation_request", proposed_by: "agent" }));
  });

  it("accepts only numbers that came from tools or the user", () => {
    const sources = ["plan before 5", { km: "12.4", costPkr: 248 }];
    expect(numbersGrounded("The trip is 12.4 km and costs about 248 rupees, before 5.", sources)).toBe(true);
    expect(numbersGrounded("The trip costs 300 rupees.", sources)).toBe(false);
    expect(numbersGrounded("۲۴۸ روپے", sources)).toBe(true);
  });
});
