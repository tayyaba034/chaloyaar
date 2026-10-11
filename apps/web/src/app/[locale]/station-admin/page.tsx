import { notFound } from "next/navigation";
import { StationAdminDashboard } from "@/components/station-admin-dashboard";
import { isAppLocale } from "@/i18n/routing";
import { requireRole } from "@/lib/role-guards";

export default async function StationAdminPage({
  params,
}: PageProps<"/[locale]/station-admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  await requireRole(locale, "station_admin", "/station-admin");
  return <StationAdminDashboard />;
}
