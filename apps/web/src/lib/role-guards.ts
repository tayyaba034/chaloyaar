import { notFound, redirect } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { resolveRoleAccess, type AppRole, type AuthProfile } from "./role-access";
import { getAuthProfile } from "./supabase-server";

export async function requireRole(
  localeValue: string,
  role: AppRole,
  pathname: string,
): Promise<AuthProfile> {
  if (!isAppLocale(localeValue)) notFound();
  const profile = await getAuthProfile();
  const decision = resolveRoleAccess(pathname, profile);
  if (!decision.allowed) {
    redirect(`/${localeValue}${decision.redirectPath}`);
  }
  if (!profile || profile.role !== role) {
    redirect(`/${localeValue}${profile ? `/${profile.role === "driver" ? "app" : profile.role}` : "/auth/sign-in"}`);
  }
  return profile;
}
