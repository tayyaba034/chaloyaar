import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiReply, readJson, validationError } from "@/lib/api-errors";
import { businessCategories } from "@/lib/businesses";
import { dbError } from "@/lib/db-errors";

// The signed-in user's businesses (any role can own one).
export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase.from("business_users")
    .select("id,role,status,business_id,businesses(id,name,category,listing_status,is_demo,address)")
    .eq("user_id", access.profile.id)
    .neq("status", "revoked")
    .order("created_at");
  if (error) return dbError(error, "business_memberships_failed");
  return apiReply({ memberships: data ?? [] });
}

const registration = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(businessCategories),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  description: z.string().trim().max(1000).optional(),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,30}$/).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
  placeId: z.uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = registration.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const input = parsed.data;
  const { data, error } = await access.supabase.rpc("register_business", {
    business_name: input.name, business_category: input.category, business_latitude: input.latitude, business_longitude: input.longitude,
    business_description: input.description || null, business_phone: input.phone || null, business_address: input.address || null, business_place: input.placeId ?? null,
  });
  if (error) return dbError(error, "business_register_failed");
  return apiReply({ businessId: data, listingStatus: "pending_review" }, 201);
}
