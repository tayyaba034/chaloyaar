import { notFound, redirect } from "next/navigation";
import { isAppLocale } from "@/i18n/routing";
import { getAuthenticatedUser } from "@/lib/supabase-server";

export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect(`/${locale}/auth/sign-in?next=/${locale}/dashboard`);
  }
  return children;
}
