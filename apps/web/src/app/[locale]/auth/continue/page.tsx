import { redirect } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { roleHome } from "@/lib/role-access";
import { getAuthProfile } from "@/lib/supabase-server";

export default async function AuthContinuePage({
  params,
  searchParams,
}: PageProps<"/[locale]/auth/continue">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isAppLocale(locale)) redirect("/");
  const profile = await getAuthProfile();
  if (!profile) redirect(`/${locale}/auth/sign-in`);
  const next = typeof query.next === "string" ? query.next : "";
  const area = next.split("/").filter(Boolean)[0];
  const roleArea =
    profile.role === "driver"
      ? "app"
      : profile.role === "provider"
        ? "provider"
        : profile.role === "station_admin"
          ? "station-admin"
          : "admin";
  const requestedAreaAllowed = area === roleArea;
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") && requestedAreaAllowed
      ? next
      : roleHome(profile.role);
  redirect(`/${locale}${safeNext}`);
}
