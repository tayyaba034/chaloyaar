import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { StationIntelligenceWorkspace } from "@/components/station-intelligence-workspace";

export default async function StationIntelligencePage({ params }: PageProps<"/[locale]/app/station-intelligence">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <StationIntelligenceWorkspace />;
}
