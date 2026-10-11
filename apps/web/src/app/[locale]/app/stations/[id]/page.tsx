import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { SpeakerButton } from "@/components/speaker-button";
import { getDiscoveryAvailability, getStationById } from "@/lib/stations";
import { StationInformation } from "@/components/station-information";
import { isAppLocale } from "@/i18n/routing";
import "../stations.css";

export default async function AppStationDetailsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/stations/[id]">) {
  const { locale, id } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, station] = await Promise.all([
    getTranslations("dashboard.stationDetail"),
    getStationById(id),
  ]);
  if (!station) notFound();
  const query = await searchParams;
  const fuel = query.fuelType === "diesel" || query.fuelType === "cng" ? query.fuelType : "petrol";
  const facts = await getDiscoveryAvailability([station.id], fuel);
  const availability = facts[station.id] ?? { state: "unknown" as const, source: null, reportedAt: null, expiresAt: null };
  const stationsT = await getTranslations("stations.discovery");

  return (
    <main className="station-detail-page">
      <Link className="back-link" href="/app/stations">← {t("back")}</Link>
      <section className="dashboard-card" aria-labelledby="station-detail-title">
        <span className="station-symbol" aria-hidden="true">⛽</span>
        <div className="dashboard-card-heading">
          <h1 id="station-detail-title">{station.name}</h1>
          <SpeakerButton text={station.name} phraseId={`station-detail-${station.id}`} />
        </div>
        {station.address && <p>{station.address}</p>}
        <p>{stationsT("fuelsNames." + fuel)}</p>
        <StationInformation key={availability.expiresAt} station={station} availability={availability} />
        {station.isDemo && <span className="demo-badge">⚠ {t("demo")}</span>}
        <div className="station-actions">
          <a className="directions-link" href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`} target="_blank" rel="noreferrer">{t("directions")}</a>
          <Link className="directions-link" href={`/app/stations/${station.id}/report`}>{t("report")}</Link>
        </div>
      </section>
    </main>
  );
}
