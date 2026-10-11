import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { SpeakerButton } from "@/components/speaker-button";
import { isAppLocale } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";

const featureNames = ["fuel", "savings", "help", "car"] as const;

export default async function ComingSoonPage({
  params,
}: PageProps<"/[locale]/coming/[feature]">) {
  const { locale, feature: featureParam } = await params;
  const feature = featureNames.find((name) => name === featureParam);
  if (!isAppLocale(locale) || !feature) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("placeholder");
  const title = t(`features.${feature}`);

  return (
    <main className="page-shell">
      <header className="page-heading">
        <Link href="/" className="back-link">{t("back")}</Link>
        <SpeakerButton text={`${title}. ${t("message")}`} phraseId="coming-soon" />
      </header>
      <section className="notice-card" aria-labelledby="coming-title">
        <span className="notice-icon" aria-hidden="true">🛠️</span>
        <h1 id="coming-title">{title}</h1>
        <p>{t("message")}</p>
      </section>
    </main>
  );
}
