import { notFound } from "next/navigation";
import { getStations } from "@/lib/stations";
import { StationReportForm } from "@/components/station-report-form";
import { requireRole } from "@/lib/role-guards";

export default async function StationReportPage({
  params,
}: PageProps<"/[locale]/app/stations/[id]/report">) {
  const { locale, id } = await params;
  if (!id || id.includes("/")) notFound();
  await requireRole(locale, "driver", `/app/stations/${id}/report`);
  const station = (await getStations()).find((item) => item.id === id);
  if (!station) notFound();
  return <StationReportForm station={station} />;
}
