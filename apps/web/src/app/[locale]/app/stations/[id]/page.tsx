import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SpeakerButton } from "@/components/speaker-button";
import { getStations } from "@/lib/stations";
import { isAppLocale } from "@/i18n/routing";

export default async function AppStationDetailsPage({
  params,
}: PageProps<"/[locale]/app/stations/[id]">) {
  const { locale, id } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, stations] = await Promise.all([
    getTranslations("dashboard.stationDetail"),
    getStations(),
  ]);
  const station = stations.find((item) => item.id === id);
  if (!station) notFound();

  return (
    <main className="station-detail-page">
      <Link className="back-link" href="/app/stations">← {t("back")}</Link>
      <section className="dashboard-card" aria-labelledby="station-detail-title">
        <span className="station-symbol" aria-hidden="true">⛽</span>
        <div className="dashboard-card-heading">
          <h1 id="station-detail-title">{station.name}</h1>
          <SpeakerButton text={`${station.name}. ${t("statusUnknown")}. ${t("priceUnknown")}`} phraseId={`station-detail-${station.id}`} />
        </div>
        {station.address && <p>{station.address}</p>}
        <p className="status-mark status-unknown"><span aria-hidden="true">?</span><strong>{t("statusUnknown")}</strong></p>
        <p>{t("priceUnknown")}</p>
        <p>{t("source", { source: station.source })}</p>
        {station.isDemo && <span className="demo-badge">⚠ {t("demo")}</span>}
        <div className="station-actions">
          <a className="directions-link" href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`} target="_blank" rel="noreferrer">{t("directions")}</a>
          <Link className="directions-link" href={`/app/stations/${station.id}/report`}>{t("report")}</Link>
        </div>
      </section>
    </main>
  );
}
