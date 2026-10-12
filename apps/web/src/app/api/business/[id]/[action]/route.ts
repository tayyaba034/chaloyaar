import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

// Member actions for one business. Membership and rules are enforced by RLS and SQL functions.
type Params = { params: Promise<{ id: string; action: string }> };

const schemas = {
  status: z.object({
    state: z.enum(["UNCONFIRMED", "CONFIRMED", "UNAVAILABLE", "TEMPORARILY_CLOSED"]),
    serviceId: z.uuid().nullable().optional(),
    label: z.string().trim().max(80).optional(),
    note: z.string().trim().max(300).optional(),
    partAvailable: z.boolean().nullable().optional(),
    partLabel: z.string().trim().max(80).optional(),
    until: z.iso.datetime({ offset: true }).nullable().optional(),
  }),
  service: z.object({
    name: z.string().trim().min(2).max(80),
    tag: z.string().trim().regex(/^[a-z0-9_]{2,40}$/).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    durationMinutes: z.number().int().min(1).max(480),
    priceNote: z.string().trim().max(120).nullable().optional(),
  }),
  hours: z.object({
    rows: z.array(z.object({
      weekday: z.number().int().min(0).max(6),
      opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      isClosed: z.boolean().default(false),
    })).max(21),
  }),
  staff: z.object({ email: z.email() }),
  claim: z.object({ note: z.string().trim().min(5).max(500) }),
};

export async function POST(request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { id: rawId, action } = await params;
  const id = z.uuid().safeParse(rawId);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid business.", 400);
  const body = await readJson(request);

  if (action === "status") {
    const parsed = schemas.status.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const { data, error } = await access.supabase.rpc("record_availability_update", {
      target_business: id.data, new_state: input.state, target_service: input.serviceId ?? null, label: input.label || null,
      update_note: input.note || null, part_is_available: input.partAvailable ?? null, part_name: input.partLabel || null, until_at: input.until ?? null,
    });
    if (error) return dbError(error, "business_status_failed");
    return apiReply({ updateId: data }, 201);
  }
  if (action === "services") {
    const parsed = schemas.service.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const input = parsed.data;
    const { data, error } = await access.supabase.from("services").insert({
      business_id: id.data, name: input.name, tag: input.tag ?? null, description: input.description ?? null,
      duration_minutes: input.durationMinutes, price_note: input.priceNote ?? null,
    }).select("id").single();
    if (error) return dbError(error, "business_service_failed");
    return apiReply({ serviceId: data.id }, 201);
  }
  if (action === "hours") {
    const parsed = schemas.hours.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    // Replace the owner's weekly hours; OSM-published rows stay visible as a separate source.
    const removed = await access.supabase.from("business_hours").delete().eq("business_id", id.data).eq("source", "owner").is("valid_on", null);
    if (removed.error) return dbError(removed.error, "business_hours_failed");
    if (parsed.data.rows.length) {
      const { error } = await access.supabase.from("business_hours").insert(parsed.data.rows.map((row) => {
        const closesNextDay = !row.isClosed && row.closesAt <= row.opensAt;
        return { business_id: id.data, weekday: row.weekday, opens_at: row.opensAt, closes_at: row.closesAt, closes_next_day: closesNextDay, is_closed: row.isClosed, source: "owner" };
      }));
      if (error) return dbError(error, "business_hours_failed");
    }
    return apiReply({ ok: true });
  }
  if (action === "staff") {
    const parsed = schemas.staff.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { data, error } = await access.supabase.rpc("add_business_staff", { target_business: id.data, staff_email: parsed.data.email });
    if (error) return dbError(error, "business_staff_failed");
    return apiReply({ membershipId: data }, 201);
  }
  if (action === "claim") {
    const parsed = schemas.claim.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);
    const { data, error } = await access.supabase.rpc("claim_business", { target_business: id.data, claim_text: parsed.data.note });
    if (error) return dbError(error, "business_claim_failed");
    return apiReply({ membershipId: data, status: "pending" }, 201);
  }
  return apiError("NOT_FOUND", "Unknown action.", 404);
}
