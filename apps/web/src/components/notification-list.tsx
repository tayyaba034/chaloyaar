"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";

type Notification = { id: string; kind: string; title: string; body: string | null; link: string | null; is_demo: boolean; created_at: string; read_at: string | null };

// In-app notifications: live through Supabase Realtime when the browser client is configured,
// otherwise refreshed every 30 seconds while visible.
export function NotificationList({ userId, onNavigate, onUnreadChange }: { userId?: string; onNavigate?: () => void; onUnreadChange?: (count: number) => void }) {
  const t = useTranslations("notifications");
  const [items, setItems] = useState<Notification[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me/notifications", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setFailure(await readFailure(response));
          return;
        }
        const body = await response.json() as { notifications: Notification[]; unread: number };
        setFailure(null);
        setItems(body.notifications);
        onUnreadChange?.(body.unread);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure({ message: t("offline") });
      });
    return () => controller.abort();
  }, [refresh, t, onUnreadChange]);

  useEffect(() => {
    const client = userId ? getSupabaseBrowserClient() : null;
    if (client && userId) {
      const channel = client
        .channel(`notifications-${userId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, reload)
        .subscribe();
      return () => { void client.removeChannel(channel); };
    }
    const timer = window.setInterval(reload, 30000);
    return () => window.clearInterval(timer);
  }, [reload, userId]);

  async function markAllRead() {
    const unread = (items ?? []).filter((item) => !item.read_at).map((item) => item.id);
    if (!unread.length) return;
    const response = await fetch("/api/me/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread }),
    }).catch(() => null);
    if (response?.ok) reload();
  }

  if (failure) return <SetupNotice failure={failure} />;
  if (!items) return <p role="status">{t("loading")}</p>;
  return (
    <div className="notification-list">
      {!items.length ? <p>{t("empty")}</p> : items.slice(0, 8).map((item) => {
        const content = (
          <>
            <strong>{item.title}{item.is_demo ? ` · ${t("demo")}` : ""}</strong>
            {item.body && <span>{item.body}</span>}
            <small>{new Date(item.created_at).toLocaleString()}</small>
          </>
        );
        return item.link
          ? <Link key={item.id} href={item.link} className={item.read_at ? "" : "is-unread"} onClick={onNavigate}>{content}</Link>
          : <div key={item.id} className={`notification-item${item.read_at ? "" : " is-unread"}`}>{content}</div>;
      })}
      {items.some((item) => !item.read_at) && (
        <button type="button" className="driver-secondary" onClick={markAllRead}>{t("markAllRead")}</button>
      )}
    </div>
  );
}
