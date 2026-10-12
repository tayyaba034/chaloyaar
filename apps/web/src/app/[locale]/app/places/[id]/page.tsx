import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { BusinessDetail } from "@/components/business-detail";

export default async function PlaceDetailPage({ params }: PageProps<"/[locale]/app/places/[id]">) {
  const { locale, id } = await params;
  if (!isAppLocale(locale) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  setRequestLocale(locale);
  return <BusinessDetail businessId={id} />;
}
