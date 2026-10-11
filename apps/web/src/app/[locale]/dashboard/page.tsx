import { redirect } from "next/navigation";

export default async function DashboardPage({
  params,
}: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  redirect(`/${locale}/app`);
}
