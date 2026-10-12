import { z } from "zod";
import { apiError, apiReply, validationError } from "@/lib/api-errors";
import { getPublicSupabaseClient } from "@/lib/supabase-public";
import { buildIntelligence, HEX_SIZE_METRES, type IntelligenceReport, type IntelligenceStation } from "@/lib/station-intelligence";
import { log } from "@/lib/log";

const query = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 14).default(24),
  fuel: z.enum(["all", "petrol", "diesel", "cng"]).default("all"),
});

// Real station and report data for the Station Intelligence page. Demo rows are excluded.
export async function GET(request: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const client = getPublicSupabaseClient();
  if (!client) return apiError("SERVICE_NOT_CONFIGURED", "Station data is not configured.", 503);
  const { hours, fuel } = parsed.data;
  const since = new Date(Date.now() - hours * 3_600_000).toISOString();

  let reportQuery = client.from("availability_reports")
    .select("station_id,fuel_type,reported_status,source_type,reported_at,expires_at")
    .eq("moderation_status", "approved")
    .eq("is_demo", false)
    .gte("reported_at", since)
    .lte("reported_at", new Date().toISOString())
    .order("reported_at", { ascending: false })
    .limit(5000);
  if (fuel !== "all") reportQuery = reportQuery.eq("fuel_type", fuel);

  const [stationsResult, reportsResult] = await Promise.all([
    client.from("station_public")
      .select("id,name,latitude,longitude,supported_fuels,verification_status")
      .eq("is_demo", false)
      .neq("verification_status", "rejected")
      .limit(5000),
    reportQuery,
  ]);
  if (stationsResult.error || reportsResult.error) {
    log.error("station_intelligence_query_failed", { stationsCode: stationsResult.error?.code, reportsCode: reportsResult.error?.code });
    return apiError("INTELLIGENCE_UNAVAILABLE", "Station data is temporarily unavailable.", 503);
  }

  const stations: IntelligenceStation[] = (stationsResult.data ?? []).flatMap((row) => {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
    const fuels = Array.isArray(row.supported_fuels) ? row.supported_fuels.map(String) : [];
    if (fuel !== "all" && fuels.length > 0 && !fuels.includes(fuel)) return [];
    return [{ id: String(row.id), name: String(row.name), latitude, longitude, supportedFuels: fuels, verificationStatus: String(row.verification_status) }];
  });
  const reports: IntelligenceReport[] = (reportsResult.data ?? []).flatMap((row) =>
    row.reported_status === "available" || row.reported_status === "unavailable" || row.reported_status === "queue_reported"
      ? [{ stationId: String(row.station_id), fuelType: String(row.fuel_type), status: row.reported_status, sourceType: String(row.source_type), reportedAt: String(row.reported_at), expiresAt: String(row.expires_at) }]
      : []);

  return apiReply({
    ...buildIntelligence(stations, reports),
    stations: stations.map(({ id, name, latitude, longitude, supportedFuels, verificationStatus }) => ({ id, name, latitude, longitude, supportedFuels, verificationStatus })),
    window: { hours, fuel, since },
    hexSizeMetres: HEX_SIZE_METRES,
    sources: ["Stations: OpenStreetMap contributors (ODbL), reviewed in Chalo Yaar", "Reports: approved driver, station and admin reports"],
    generatedAt: new Date().toISOString(),
  });
}
