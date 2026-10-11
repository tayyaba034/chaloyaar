import { redirect } from "next/navigation";

export default async function StationsPage({
  params,
}: PageProps<"/[locale]/stations">) {
  const { locale } = await params;
  redirect(`/${locale}/app/stations`);
}
