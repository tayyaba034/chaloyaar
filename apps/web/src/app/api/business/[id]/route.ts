import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, readJson, validationError } from "@/lib/api-errors";
import { dbError } from "@/lib/db-errors";

type Params = { params: Promise<{ id: string }> };

// Everything the business dashboard needs. RLS limits rows to members of this business.
export async function GET(_request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid business.", 400);
  const membership = await access.supabase.from("business_users").select("role,status").eq("business_id", id.data).eq("user_id", access.profile.id).eq("status", "active").maybeSingle();
  if (membership.error) return dbError(membership.error, "business_membership_failed");
  if (!membership.data) return apiError("FORBIDDEN", "You are not a member of this business.", 403);
  const [business, availability, services, hours, requests, appointments, staff, updates, audit] = await Promise.all([
    access.supabase.from("businesses").select("id,name,category,description,phone,address,latitude,longitude,listing_status,is_demo,published_hours_text,source").eq("id", id.data).single(),
    access.supabase.rpc("current_availability", { target_business: id.data }),
    access.supabase.from("services").select("id,name,tag,description,duration_minutes,price_note,is_active").eq("business_id", id.data).order("name"),
    access.supabase.from("business_hours").select("id,weekday,opens_at,closes_at,closes_next_day,is_closed,valid_on,source").eq("business_id", id.data).order("weekday"),
    access.supabase.from("verification_events").select("id,service_id,status,question,window_start,window_end,requested_at,expires_at,responded_at,response_note,is_demo,requested_by,profiles!verification_events_requested_by_fkey(display_name)").eq("business_id", id.data).order("requested_at", { ascending: false }).limit(30),
    access.supabase.from("appointment_requests").select("id,service_id,status,window_start,window_end,note,expires_at,decision_note,is_demo,profiles!appointment_requests_user_id_fkey(display_name)").eq("business_id", id.data).order("window_start", { ascending: false }).limit(30),
    access.supabase.from("business_users").select("id,role,status,user_id,profiles!business_users_user_id_fkey(display_name)").eq("business_id", id.data).neq("status", "revoked"),
    access.supabase.from("availability_updates").select("id,service_id,state,source,note,part_available,part_label,resource_label,submitter_role,submitted_at,valid_until").eq("business_id", id.data).order("submitted_at", { ascending: false }).limit(20),
    access.supabase.from("audit_logs").select("id,action,entity_type,created_at,actor_id").eq("business_id", id.data).order("created_at", { ascending: false }).limit(30),
  ]);
  const failed = [business, availability, services, hours, requests, appointments, staff, updates, audit].find((result) => result.error);
  if (failed?.error) return dbError(failed.error, "business_dashboard_failed");
  const now = Date.now();
  return apiReply({
    role: membership.data.role,
    business: business.data,
    availability: (availability.data as unknown[] | null)?.[0] ?? null,
    services: services.data,
    hours: hours.data,
    // Requests past expiry are shown as expired; the business can no longer answer them.
    requests: (requests.data ?? []).map((row) => ({ ...row, status: row.status === "requested" && Date.parse(row.expires_at) <= now ? "expired" : row.status })),
    appointments: (appointments.data ?? []).map((row) => ({ ...row, status: row.status === "pending" && Date.parse(row.expires_at) <= now ? "expired" : row.status })),
    staff: staff.data,
    updates: updates.data,
    audit: audit.data,
  });
}

const details = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable(),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,30}$/).nullable().or(z.literal("")),
  address: z.string().trim().max(300).nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function PATCH(request: Request, { params }: Params) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return apiError("VALIDATION_ERROR", "Choose a valid business.", 400);
  const parsed = details.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { data, error } = await access.supabase.from("businesses").update({
    name: input.name, description: input.description || null, phone: input.phone || null, address: input.address || null,
    latitude: Number(input.latitude.toFixed(6)), longitude: Number(input.longitude.toFixed(6)), updated_at: new Date().toISOString(),
  }).eq("id", id.data).select("id");
  if (error) return dbError(error, "business_update_failed");
  if (!data?.length) return apiError("FORBIDDEN", "Only the owner can edit business details.", 403);
  return apiReply({ ok: true });
}
