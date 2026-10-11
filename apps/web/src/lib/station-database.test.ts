import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), neq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase-config", () => ({ getSupabaseConfig: () => ({ url: "https://example.invalid", key: "test" }) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { getNearbyStations, getStationById } from "./stations";

const row = {
  id: "11111111-1111-4111-8111-111111111111", name: "Synthetic database fixture",
  latitude: 31.4, longitude: 73.1, supported_fuels: [], verification_status: "unverified",
  is_demo: false, source: "Fixture", verified_at: null, distance_km: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: mocks.select, eq: mocks.eq, neq: mocks.neq, maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(query); mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query); mocks.neq.mockReturnValue(query);
});
describe("indexed discovery data access", () => {
  it("delegates coordinates, radius and fuel to the database rather than fetching an arbitrary collection", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    const result = await getNearbyStations({ latitude: 31.4, longitude: 73.1, radiusKm: 15, fuelType: null });
    expect(mocks.rpc).toHaveBeenCalledWith("nearby_stations", { search_latitude: 31.4, search_longitude: 73.1, radius_km: 15, requested_fuel: null });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(result[0].supportedFuels).toEqual([]);
    expect(result[0].verificationStatus).toBe("unverified");
  });
  it("loads the same record by ID with demo/rejected exclusions, without a collection cap", async () => {
    mocks.rpc.mockResolvedValue({ data: [row], error: null });
    mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
    const [nearby] = await getNearbyStations({ latitude: 31.4, longitude: 73.1, radiusKm: 15, fuelType: null });
    const details = await getStationById(row.id);
    const { distanceKm, distanceKind, ...record } = nearby;
    expect(distanceKm).toBe(2); expect(distanceKind).toBe("straight_line_approximate");
    expect(details).toEqual(record);
    expect(mocks.eq).toHaveBeenCalledWith("id", row.id);
    expect(mocks.eq).toHaveBeenCalledWith("is_demo", false);
    expect(mocks.neq).toHaveBeenCalledWith("verification_status", "rejected");
  });
  it("rejects invalid IDs without querying the database", async () => {
    expect(await getStationById("sample-or-invalid-id")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
