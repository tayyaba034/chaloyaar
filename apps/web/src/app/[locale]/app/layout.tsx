import { cookies } from "next/headers";
import { DriverAppShell } from "@/components/driver-app-shell";
import { getAuthProfile } from "@/lib/supabase-server";
import "../brand.css";
import "./driver.css";

export default async function DriverAppLayout({
  children,
}: LayoutProps<"/[locale]/app">) {
  const [profile, cookieStore] = await Promise.all([getAuthProfile(), cookies()]);
  return (
    <DriverAppShell
      authenticated={profile?.role === "driver"}
      userId={profile?.role === "driver" ? profile.id : undefined}
      displayName={profile?.role === "driver" ? profile.displayName : null}
      autoReadInitially={cookieStore.get("chalo-auto-read")?.value === "true"}
    >
      {children}
    </DriverAppShell>
  );
}
