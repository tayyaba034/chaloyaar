import { z } from "zod";
import { apiError, apiReply, isMissingSchema, migrationPending, validationError } from "@/lib/api-errors";
import { getPublicSupabaseClient } from "@/lib/supabase-public";
import { log } from "@/lib/log";
import { migrations } from "@/lib/migrations";

const query = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters.").max(80),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8),
}).refine((value) => (value.lat === undefined) === (value.lng === undefined), "Send both lat and lng, or neither.");

type PlaceResult = {
  id: string;
  nameEn: string;
  nameUr: string | null;
  nameRoman: string | null;
  kind: string;
  latitude: number;
  longitude: number;
  distanceKm: number | null;
};

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = query.safeParse(params);
  if (!parsed.success) return validationError(parsed.error);
  const client = getPublicSupabaseClient();
  if (!client) return apiError("SERVICE_NOT_CONFIGURED", "Place search is not configured.", 503);
  const { q, lat, lng, limit } = parsed.data;
  const { data, error } = await client.rpc("search_places", {
    query: q, near_latitude: lat ?? null, near_longitude: lng ?? null, max_results: limit,
  });
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    log.error("place_search_failed", { code: error.code });
    return apiError("PLACE_SEARCH_UNAVAILABLE", "Place search is temporarily unavailable.", 503);
  }
  const places: PlaceResult[] = (data as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    nameEn: String(row.name_en),
    nameUr: typeof row.name_ur === "string" ? row.name_ur : null,
    nameRoman: typeof row.name_roman === "string" ? row.name_roman : null,
    kind: String(row.kind),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
  }));
  return apiReply({ places, source: "OpenStreetMap contributors (ODbL)" });
}
