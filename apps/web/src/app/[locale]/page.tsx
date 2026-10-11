import { setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { HomeExperience } from "@/components/home-experience";
import { isAppLocale } from "@/i18n/routing";
import "./landing.css";

export default async function HomePage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const cookieStore = await cookies();

  return (
    <HomeExperience
      languageSelected={cookieStore.has("chalo-language-picked")}
    />
  );
}
