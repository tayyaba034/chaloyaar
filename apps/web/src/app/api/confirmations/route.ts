import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, isMissingSchema, migrationPending, readJson, validationError } from "@/lib/api-errors";
import { migrations } from "@/lib/migrations";
import { log } from "@/lib/log";

// A user's explicit click on "Request confirmation" is the approval for sending it.
const body = z.object({
  businessId: z.uuid(),
  serviceId: z.uuid().nullable().optional(),
  question: z.string().trim().min(3).max(200),
  windowStart: z.iso.datetime({ offset: true }).nullable().optional(),
  windowEnd: z.iso.datetime({ offset: true }).nullable().optional(),
  itineraryId: z.uuid().nullable().optional(),
  stopId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { data, error } = await access.supabase.rpc("request_confirmation", {
    target_business: input.businessId, request_question: input.question, target_service: input.serviceId ?? null,
    start_at: input.windowStart ?? null, end_at: input.windowEnd ?? null, target_itinerary: input.itineraryId ?? null, target_stop: input.stopId ?? null,
  });
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.tripPlanner);
    if (error.code === "P0001") return apiError("REQUEST_REFUSED", error.message, 409);
    log.error("confirmation_request_failed", { code: error.code });
    return apiError("CONFIRMATION_UNAVAILABLE", "The request could not be sent. Please try again.", 503);
  }
  const row = (data as Array<{ request_id: string; request_status: string; failure: string | null }>)[0];
  log.info("confirmation_requested", { status: row.request_status });
  return apiReply({ requestId: row.request_id, status: row.request_status, failure: row.failure }, 201);
}

export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase.from("verification_events")
    .select("id,business_id,service_id,status,channel,question,requested_at,expires_at,responded_at,response_note,failure_reason,is_demo,businesses(name)")
    .eq("requested_by", access.profile.id)
    .order("requested_at", { ascending: false })
    .limit(30);
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.tripPlanner);
    log.error("confirmation_list_failed", { code: error.code });
    return apiError("CONFIRMATION_UNAVAILABLE", "Requests are temporarily unavailable.", 503);
  }
  const now = Date.now();
  return apiReply({
    requests: (data ?? []).map((row) => ({
      ...row,
      // An open request past its expiry is shown as expired; it never turns into a confirmation.
      status: row.status === "requested" && Date.parse(row.expires_at) <= now ? "expired" : row.status,
    })),
  });
}
