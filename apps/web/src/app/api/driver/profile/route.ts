import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { isAppLocale } from "@/i18n/routing";
const fields =
  "id,display_name,preferred_language,is_demo,driver_auto_read,driver_notifications,driver_reduced_motion";
const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET() {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const [{ data, error }, user] = await Promise.all([
    access.supabase
      .from("profiles")
      .select(fields)
      .eq("id", access.profile.id)
      .single(),
    access.supabase.auth.getUser(),
  ]);
  return error
    ? reply({ error: { message: "Profile unavailable." } }, 503)
    : reply({
        profile: {
          ...data,
          email: user.data.user?.email ?? "",
          phone: user.data.user?.phone ?? "",
        },
      });
}
export async function PATCH(request: NextRequest) {
  const access = await requireApiRole("driver");
  if ("response" in access) return access.response;
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object")
    return reply({ error: { message: "Enter valid profile details." } }, 400);
  const changes: Record<string, string | boolean> = {};
  if ("displayName" in payload) {
    if (
      typeof payload.displayName !== "string" ||
      !payload.displayName.trim() ||
      payload.displayName.trim().length > 60
    )
      return reply(
        { error: { message: "Name must contain 1 to 60 characters." } },
        400,
      );
    changes.display_name = payload.displayName.trim();
  }
  if ("language" in payload) {
    if (!isAppLocale(payload.language))
      return reply({ error: { message: "Unsupported language." } }, 400);
    changes.preferred_language = payload.language;
  }
  for (const key of [
    "driver_auto_read",
    "driver_notifications",
    "driver_reduced_motion",
  ])
    if (key in payload) {
      if (typeof payload[key] !== "boolean")
        return reply({ error: { message: "Invalid preference." } }, 400);
      changes[key] = payload[key];
    }
  if (!Object.keys(changes).length)
    return reply({ error: { message: "No supported changes supplied." } }, 400);
  const { data, error } = await access.supabase
    .from("profiles")
    .update(changes)
    .eq("id", access.profile.id)
    .eq("role", "driver")
    .select(fields)
    .single();
  return error
    ? reply({ error: { message: "Profile could not be saved." } }, 503)
    : reply({ profile: data });
}
