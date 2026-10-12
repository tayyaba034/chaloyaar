import { z } from "zod";
import { apiError, apiReply, isMissingSchema, migrationPending } from "@/lib/api-errors";
import { businessDetails } from "@/lib/businesses";
import { getPublicSupabaseClient } from "@/lib/supabase-public";
import { migrations } from "@/lib/migrations";
import { log } from "@/lib/log";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid business.", 400);
  const client = getPublicSupabaseClient();
  if (!client) return apiError("SERVICE_NOT_CONFIGURED", "Business details are not configured.", 503);
  const result = await businessDetails(client, id.data);
  if (!result.ok) {
    if ("notFound" in result) return apiError("NOT_FOUND", "That business was not found.", 404);
    if (isMissingSchema(result.error)) return migrationPending(migrations.tripPlanner);
    log.error("business_details_failed", { code: result.error.code });
    return apiError("BUSINESS_UNAVAILABLE", "Business details are temporarily unavailable.", 503);
  }
  return apiReply(result);
}
