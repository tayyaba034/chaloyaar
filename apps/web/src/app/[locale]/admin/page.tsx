import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AdminDashboard } from "@/components/admin-dashboard";
import { isAppLocale } from "@/i18n/routing";

export default async function AdminHomePage({
  params,
}: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  await getTranslations("dashboard.admin");
  return <AdminDashboard />;
}
