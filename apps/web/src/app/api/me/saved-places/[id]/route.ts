import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, isMissingSchema, migrationPending } from "@/lib/api-errors";
import { log } from "@/lib/log";
import { migrations } from "@/lib/migrations";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid saved place.", 400);
  const { data, error } = await access.supabase
    .from("driver_saved_places")
    .delete()
    .eq("id", id.data)
    .eq("user_id", access.profile.id)
    .select("id");
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    log.error("saved_place_delete_failed", { code: error.code });
    return apiError("SAVED_PLACES_UNAVAILABLE", "The place could not be removed.", 503);
  }
  if (!data?.length) return apiError("NOT_FOUND", "That saved place was not found.", 404);
  return apiReply({ ok: true });
}
