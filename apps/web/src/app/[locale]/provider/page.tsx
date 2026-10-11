import { notFound } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ProviderDashboard } from "@/components/provider-dashboard";

export default async function ProviderHomePage({
  params,
}: PageProps<"/[locale]/provider">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  await getTranslations("dashboard.provider");
  return <ProviderDashboard />;
}
