import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

// A business member answers a confirmation request, decides an appointment, edits a service,
// or removes staff. Each action is checked again in SQL/RLS.
const body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("confirmation"), requestId: z.uuid(), available: z.boolean(), note: z.string().trim().max(300).optional(), until: z.iso.datetime({ offset: true }).nullable().optional() }),
  z.object({ kind: z.literal("appointment"), appointmentId: z.uuid(), decision: z.enum(["confirmed", "declined"]), note: z.string().trim().max(300).optional() }),
  z.object({ kind: z.literal("service"), serviceId: z.uuid(), isActive: z.boolean() }),
  z.object({ kind: z.literal("remove_staff"), membershipId: z.uuid() }),
]);

export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = body.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  if (input.kind === "confirmation") {
    const { error } = await access.supabase.rpc("respond_to_confirmation", {
      target_request: input.requestId, is_available: input.available, response: input.note || null, available_until: input.until ?? null,
    });
    if (error) return dbError(error, "business_respond_failed");
  } else if (input.kind === "appointment") {
    const { error } = await access.supabase.rpc("decide_appointment", { target_appointment: input.appointmentId, decision: input.decision, decision_text: input.note || null });
    if (error) return dbError(error, "business_appointment_failed");
  } else if (input.kind === "service") {
    const { data, error } = await access.supabase.from("services").update({ is_active: input.isActive, updated_at: new Date().toISOString() }).eq("id", input.serviceId).select("id");
    if (error) return dbError(error, "business_service_update_failed");
    if (!data?.length) return dbError({ code: "42501" }, "business_service_update_failed");
  } else {
    const { error } = await access.supabase.rpc("remove_business_staff", { membership: input.membershipId });
    if (error) return dbError(error, "business_staff_remove_failed");
  }
  return apiReply({ ok: true });
}
