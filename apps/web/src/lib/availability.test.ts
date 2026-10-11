import { describe, expect, it } from "vitest";
import { resolveAvailabilityStatus } from "./availability";

describe("resolveAvailabilityStatus", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");

  it("keeps missing availability as Unknown, never Unavailable", () => {
    expect(resolveAvailabilityStatus(null, now)).toBe("unknown");
  });

  it("marks an expired report as stale instead of treating it as unavailable", () => {
    expect(
      resolveAvailabilityStatus(
        { reported_status: "available", expires_at: "2026-10-11T11:00:00.000Z" },
        now,
      ),
    ).toBe("stale");
  });

  it("preserves an explicit, current unavailable report", () => {
    expect(
      resolveAvailabilityStatus(
        { reported_status: "unavailable", expires_at: "2026-10-12T12:00:00.000Z" },
        now,
      ),
    ).toBe("unavailable");
  });
});
