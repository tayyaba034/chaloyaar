import type { ReactNode } from "react";
import { requireRole } from "@/lib/role-guards";

export default async function ProtectedDriverLayout({
  children,
  params,
}: LayoutProps<"/[locale]/app"> & { children: ReactNode }) {
  const { locale } = await params;
  await requireRole(locale, "driver", "/app");
  return children;
}
