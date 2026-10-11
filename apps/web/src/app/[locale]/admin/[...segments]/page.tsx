import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { StationReportModeration } from "@/components/station-report-moderation";
import { AdminFuelPrices } from "@/components/admin-fuel-prices";
import { AdminStationAvailability } from "@/components/admin-station-availability";

const sections: Record<string, Parameters<typeof FeaturePlaceholder>[0]["feature"]> = {
  "fuel-prices": "adminFuelPrices",
  stations: "adminStations",
  reports: "adminReports",
  providers: "adminProviders",
  requests: "adminRequests",
  coverage: "adminCoverage",
  audit: "adminAudit",
};

export default async function AdminSectionPage({
  params,
}: PageProps<"/[locale]/admin/[...segments]">) {
  const { segments } = await params;
  if (segments.join("/") === "reports") return <StationReportModeration />;
  if (segments.join("/") === "fuel-prices") return <AdminFuelPrices />;
  if (segments.join("/") === "stations") return <AdminStationAvailability />;
  const feature = segments.length === 1 ? sections[segments[0]] : undefined;
  if (!feature) notFound();
  return <FeaturePlaceholder feature={feature} />;
}
