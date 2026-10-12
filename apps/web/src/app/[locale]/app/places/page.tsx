import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { BusinessSearch } from "@/components/business-search";

export default async function PlacesPage({ params }: PageProps<"/[locale]/app/places">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <BusinessSearch />;
}
