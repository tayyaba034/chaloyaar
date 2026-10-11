import { cookies } from "next/headers";
import { DriverAppShell } from "@/components/driver-app-shell";
import { getAuthProfile } from "@/lib/supabase-server";

export default async function DriverAppLayout({
  children,
}: LayoutProps<"/[locale]/app">) {
  const [profile, cookieStore] = await Promise.all([getAuthProfile(), cookies()]);
  return (
    <DriverAppShell
      authenticated={profile?.role === "driver"}
      displayName={profile?.role === "driver" ? profile.displayName : null}
      autoReadInitially={cookieStore.get("chalo-auto-read")?.value === "true"}
    >
      {children}
    </DriverAppShell>
  );
}
