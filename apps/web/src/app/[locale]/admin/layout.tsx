import type { ReactNode } from "react";
import { AdminAppShell } from "@/components/admin-app-shell";
import { requireRole } from "@/lib/role-guards";

export default async function AdminLayout({
  children,
  params,
}: LayoutProps<"/[locale]/admin"> & { children: ReactNode }) {
  const { locale } = await params;
  await requireRole(locale, "admin", "/admin");
  return <AdminAppShell>{children}</AdminAppShell>;
}
