import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { isAppLocale } from "@/i18n/routing";
import { featureRegistry, registrySummary, type FeatureTrack } from "@/lib/feature-registry";
import "./features.css";

const tracks: FeatureTrack[] = ["shared", "trip_planner", "station_intelligence"];

export default async function FeaturesPage({ params }: PageProps<"/[locale]/app/features">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("features");
  const summary = registrySummary();
  return (
    <main className="driver-page feature-status">
      <div className="driver-page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="driver-small">{t("subtitle")}</p>
        </div>
      </div>
      <p className="feature-summary" role="status">
        {t("summary", { done: summary.done, inProgress: summary.inProgress, planned: summary.planned })}
      </p>
      {tracks.map((track) => (
        <section className="driver-section" key={track} aria-labelledby={`track-${track}`}>
          <h2 id={`track-${track}`}>{t(`tracks.${track}`)}</h2>
          <ul className="feature-list">
            {featureRegistry.filter((entry) => entry.track === track).map((entry) => (
              <li key={entry.id} className={`feature-item feature-item--${entry.status}`}>
                <div className="feature-item-head">
                  <span className={`feature-chip feature-chip--${entry.status}`}>{t(`statuses.${entry.status}`)}</span>
                  <h3 lang="en" dir="ltr"><span className="feature-id">{entry.id}</span> {entry.title}</h3>
                </div>
                <p lang="en" dir="ltr">{entry.summary}</p>
                {entry.howToCheck && entry.status !== "planned" && (
                  <div>
                    <strong className="feature-label">{t("howToCheck")}</strong>
                    <ol lang="en" dir="ltr">{entry.howToCheck.map((step) => <li key={step}>{step}</li>)}</ol>
                  </div>
                )}
                {entry.needs && (
                  <p className="feature-needs">
                    <strong className="feature-label">{t("needs")}:</strong>{" "}
                    {entry.needs.map((need) => <span className="feature-need" key={need} lang="en" dir="ltr">{need}</span>)}
                  </p>
                )}
                <div className="driver-actions">
                  {entry.tryIt && entry.status !== "planned" && (
                    <Link className="driver-secondary" href={entry.tryIt.href} lang="en" dir="ltr">{entry.tryIt.label}</Link>
                  )}
                  {entry.commits && (
                    <span className="driver-small">{t("commits")}: <code>{entry.commits.join(", ")}</code></span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
