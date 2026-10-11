import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { isAppLocale } from "@/i18n/routing";
import { DemoDriverDashboard, type DemoSection } from "@/components/demo-driver-dashboard";
import "../dashboard.css";

export default async function DemoPage({ params }: {
  params: Promise<{ locale: string; section?: string[] }>;
}) {
  const { locale, section } = await params;
  const active = section?.[0] ?? "stations";
  if (!isAppLocale(locale) || (section?.length ?? 0) > 1 ||
    !["stations", "truecost", "help", "vehicle", "settings", "profile"].includes(active)) notFound();
  setRequestLocale(locale);
  return <DemoDriverDashboard section={active as DemoSection} />;
}
