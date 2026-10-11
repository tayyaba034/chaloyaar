import { useTranslations } from "next-intl";
import { SpeakerButton } from "./speaker-button";

type PlaceholderKey =
  | "truecost"
  | "help"
  | "helpNew"
  | "helpDetail"
  | "vehicle"
  | "vehicleLog"
  | "settings"
  | "stationReport"
  | "providerRequests"
  | "providerServices"
  | "providerProfile"
  | "adminFuelPrices"
  | "adminStations"
  | "adminReports"
  | "adminProviders"
  | "adminRequests"
  | "adminCoverage"
  | "adminAudit";

export function FeaturePlaceholder({ feature }: { feature: PlaceholderKey }) {
  const t = useTranslations(`dashboard.placeholders.${feature}`);
  const title = t("title");
  const message = t("message");
  return (
    <main className="feature-placeholder">
      <section className="notice-card" aria-labelledby="placeholder-title">
        <span className="notice-icon" aria-hidden="true">{t("icon")}</span>
        <div className="dashboard-card-heading">
          <h1 id="placeholder-title">{title}</h1>
          <SpeakerButton text={`${title}. ${message}`} phraseId={`placeholder-${feature}`} />
        </div>
        <p>{message}</p>
      </section>
    </main>
  );
}
