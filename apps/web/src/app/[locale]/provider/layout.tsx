import type { ReactNode } from "react";
import { ProviderAppShell } from "@/components/provider-app-shell";
import { requireRole } from "@/lib/role-guards";

export default async function ProviderLayout({
  children,
  params,
}: LayoutProps<"/[locale]/provider"> & { children: ReactNode }) {
  const { locale } = await params;
  const profile = await requireRole(locale, "provider", "/provider");
  return (
    <ProviderAppShell
      displayName={profile.displayName}
      verificationStatus={profile.verificationStatus ?? "pending"}
    >
      {children}
    </ProviderAppShell>
  );
}
