import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FeaturePlaceholder } from "@/components/feature-placeholder";
import { requireRole } from "@/lib/role-guards";

export default async function StationReportPage({
  params,
}: PageProps<"/[locale]/app/stations/[id]/report">) {
  const { locale, id } = await params;
  if (!id || id.includes("/")) notFound();
  await requireRole(locale, "driver", `/app/stations/${id}/report`);
  await getTranslations("dashboard.placeholders.stationReport");
  return <FeaturePlaceholder feature="stationReport" />;
}
