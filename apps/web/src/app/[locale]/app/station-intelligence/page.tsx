import { notFound } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { StationIntelligenceWorkspace } from "@/components/station-intelligence-workspace";

export default async function StationIntelligencePage({ params }: PageProps<"/[locale]/app/station-intelligence">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <StationIntelligenceWorkspace />;
}
