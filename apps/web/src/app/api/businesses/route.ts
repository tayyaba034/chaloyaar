import { z } from "zod";
import { apiError, apiReply, isMissingSchema, migrationPending, validationError } from "@/lib/api-errors";
import { businessCategories, searchBusinesses, showDemoBusinesses } from "@/lib/businesses";
import { getPublicSupabaseClient } from "@/lib/supabase-public";
import { migrations } from "@/lib/migrations";
import { log } from "@/lib/log";

const query = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.enum(businessCategories).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(0.5).max(50).default(15),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).refine((value) => (value.lat === undefined) === (value.lng === undefined), "Send both lat and lng, or neither.");

export async function GET(request: Request) {
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return validationError(parsed.error);
  const client = getPublicSupabaseClient();
  if (!client) return apiError("SERVICE_NOT_CONFIGURED", "Business search is not configured.", 503);
  const { q, category, lat, lng, radius, limit } = parsed.data;
  const result = await searchBusinesses(client, { query: q, category, near: lat !== undefined ? { latitude: lat, longitude: lng! } : null, radiusKm: radius, limit });
  if (!result.ok) {
    if (isMissingSchema(result.error)) return migrationPending(migrations.tripPlanner);
    log.error("business_search_failed", { code: result.error.code });
    return apiError("BUSINESS_SEARCH_UNAVAILABLE", "Business search is temporarily unavailable.", 503);
  }
  return apiReply({ businesses: result.businesses, demoShown: showDemoBusinesses(), source: "Business listings: owners, admins and OpenStreetMap contributors (ODbL)" });
}
