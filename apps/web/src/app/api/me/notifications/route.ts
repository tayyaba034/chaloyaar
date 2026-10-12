import { z } from "zod";
import { requireApiUser } from "@/lib/api-auth";
import { apiError, apiReply, isMissingSchema, migrationPending, readJson, validationError } from "@/lib/api-errors";
import { log } from "@/lib/log";
import { migrations } from "@/lib/migrations";


export async function GET() {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const { data, error } = await access.supabase
    .from("notifications")
    .select("id,kind,title,body,link,payload,is_demo,created_at,read_at")
    .eq("user_id", access.profile.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    log.error("notifications_query_failed", { code: error.code });
    return apiError("NOTIFICATIONS_UNAVAILABLE", "Notifications are temporarily unavailable.", 503);
  }
  return apiReply({ notifications: data ?? [], unread: (data ?? []).filter((item) => !item.read_at).length });
}

const markRead = z.object({ ids: z.array(z.uuid()).min(1).max(50) });

export async function POST(request: Request) {
  const access = await requireApiUser();
  if ("response" in access) return access.response;
  const parsed = markRead.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);
  const { error } = await access.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", parsed.data.ids)
    .eq("user_id", access.profile.id)
    .is("read_at", null);
  if (error) {
    if (isMissingSchema(error)) return migrationPending(migrations.shared);
    log.error("notifications_mark_read_failed", { code: error.code });
    return apiError("NOTIFICATIONS_UNAVAILABLE", "Notifications could not be updated.", 503);
  }
  return apiReply({ ok: true });
}
