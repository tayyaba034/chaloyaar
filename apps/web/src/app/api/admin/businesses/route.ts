import { z } from "zod";
import { requireApiRole } from "@/lib/api-auth";
import { apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

// Admin review queue: new registrations, ownership claims and confirmation requests that need a phone call.
export async function GET() {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const [pending, claims, calls] = await Promise.all([
    access.supabase.from("businesses").select("id,name,category,address,phone,latitude,longitude,created_at,listing_status").eq("listing_status", "pending_review").order("created_at"),
    access.supabase.from("business_users").select("id,claim_note,created_at,business_id,businesses(name,category,address),profiles!business_users_user_id_fkey(display_name)").eq("status", "pending").order("created_at"),
    access.supabase.from("verification_events").select("id,question,status,requested_at,expires_at,businesses(name,phone)").in("status", ["requested", "not_configured"]).order("requested_at", { ascending: false }).limit(30),
  ]);
  const failed = [pending, claims, calls].find((result) => result.error);
  if (failed?.error) return dbError(failed.error, "admin_businesses_failed");
  return apiReply({ pending: pending.data, claims: claims.data, calls: calls.data });
}

const action = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("review"), businessId: z.uuid(), decision: z.enum(["active", "suspended", "rejected"]) }),
  z.object({ kind: z.literal("claim"), membershipId: z.uuid(), approve: z.boolean() }),
  // Records a phone call made by an admin; "no_answer" is never treated as a confirmation.
  z.object({ kind: z.literal("manual_confirmation"), requestId: z.uuid(), outcome: z.enum(["available", "unavailable", "no_answer"]), note: z.string().trim().min(3).max(300) }),
]);

export async function POST(request: Request) {
  const access = await requireApiRole("admin");
  if ("response" in access) return access.response;
  const parsed = action.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { error } = input.kind === "review"
    ? await access.supabase.rpc("review_business", { target_business: input.businessId, decision: input.decision })
    : input.kind === "claim"
      ? await access.supabase.rpc("review_business_claim", { membership: input.membershipId, approve: input.approve })
      : await access.supabase.rpc("record_manual_confirmation", { target_request: input.requestId, outcome: input.outcome, response: input.note });
  if (error) return dbError(error, "admin_business_action_failed");
  return apiReply({ ok: true });
}
