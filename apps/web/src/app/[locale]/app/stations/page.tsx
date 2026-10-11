import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { StationDiscovery } from "@/components/station-discovery";
import { isAppLocale } from "@/i18n/routing";
import "./stations.css";

export default async function AppStationsPage({
  params,
}: PageProps<"/[locale]/app/stations">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  await getTranslations("stations");
  return <StationDiscovery />;
}
