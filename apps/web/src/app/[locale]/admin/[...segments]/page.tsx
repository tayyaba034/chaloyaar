import { notFound } from "next/navigation";
import { FeaturePlaceholder } from "@/components/feature-placeholder";

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
  const feature = segments.length === 1 ? sections[segments[0]] : undefined;
  if (!feature) notFound();
  return <FeaturePlaceholder feature={feature} />;
}
