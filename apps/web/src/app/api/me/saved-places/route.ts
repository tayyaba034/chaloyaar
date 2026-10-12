import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, isMissingSchema, migrationPending, readJson, validationError } from "@/lib/api-errors";
import { log } from "@/lib/log";
import { migrations } from "@/lib/migrations";

const columns = "id,label,kind,place_id,address,latitude,longitude,created_at";

export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("driver_saved_places")
    .select(columns)
    .eq("user_id", access.profile.id)
    .order("created_at");
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    log.error("saved_places_query_failed", { code: error.code });
    return apiError("SAVED_PLACES_UNAVAILABLE", "Saved places are temporarily unavailable.", 503);
  }
  return apiReply({ places: data ?? [] });
}

const newPlace = z.object({
  label: z.string().trim().min(1).max(60),
  kind: z.enum(["home", "work", "custom"]).default("custom"),
  placeId: z.uuid().nullable().optional(),
  address: z.string().trim().max(200).nullable().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = newPlace.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const place = parsed.data;
  const { data, error } = await access.supabase
    .from("driver_saved_places")
    .insert({
      user_id: access.profile.id,
      label: place.label,
      kind: place.kind,
      place_id: place.placeId ?? null,
      address: place.address || null,
      latitude: Number(place.latitude.toFixed(6)),
      longitude: Number(place.longitude.toFixed(6)),
    })
    .select(columns)
    .single();
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    if (error.code === "23505") return apiError("DUPLICATE_KIND", `You already saved a ${place.kind} place. Remove it first.`, 409);
    if (error.message?.includes("up to 20")) return apiError("LIMIT_REACHED", "You can save up to 20 places.", 409);
    log.error("saved_place_insert_failed", { code: error.code });
    return apiError("SAVED_PLACES_UNAVAILABLE", "The place could not be saved.", 503);
  }
  return apiReply({ place: data }, 201);
}
