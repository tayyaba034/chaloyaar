"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SpeakerButton } from "./speaker-button";

type DriverDashboardData = {
  profile: { displayName: string | null };
  nearestStation: null | {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    distanceKm: number;
    source: string;
    updatedAt: string;
    isDemo: boolean;
    availability: {
      state: "available" | "unavailable" | "stale" | "unknown" | "queue_reported";
      source: string | null;
      reportedAt: string | null;
      isDemo: boolean;
    };
  };
  activeRequest: null | { id: string; service_type: string; status: string };
  monthlySpend: number | null;
  kmPerLitre: number | null;
  officialPrice: null | {
    pricePerLitre: number;
    source: string;
    effectiveAt: string;
    checkedAt: string;
    isDemo: boolean;
  };
};

const tiles = [
  { key: "stations", href: "/app/stations" },
  { key: "truecost", href: "/app/truecost" },
  { key: "help", href: "/app/help" },
  { key: "vehicle", href: "/app/vehicle" },
] as const;

const statusIcons = {
  available: "✓",
  unknown: "?",
  stale: "◷",
  unavailable: "×",
  queue_reported: "◷",
} as const;

export function DriverDashboard() {
  const t = useTranslations("dashboard.driver");
  const shellT = useTranslations("shell.driver.navigation");
  const locale = useLocale();
  const [data, setData] = useState<DriverDashboardData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch("/api/dashboard/driver", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Dashboard returned ${response.status}`);
        return (await response.json()) as DriverDashboardData;
      })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(false);
      })
      .catch((loadError: unknown) => {
        console.error("Driver dashboard could not be loaded", loadError);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  const statusLabel = (state: keyof typeof statusIcons) =>
    t(state === "queue_reported" ? "queueReported" : state);
  const reportSource = (source: string | null) =>
    source === "user" || source === "station" || source === "admin"
      ? t(`sources.${source}`)
      : t("noCurrentReport");
  const greeting = data?.profile.displayName
    ? t("greeting", { name: data.profile.displayName })
    : t("greetingGuest");

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting" aria-labelledby="driver-greeting">
        <div>
          <p className="eyebrow">{t("summary")}</p>
          <h1 id="driver-greeting">{greeting}</h1>
        </div>
        <SpeakerButton text={`${greeting}. ${t("summary")}`} phraseId="driver-dashboard-summary" />
      </section>

      <nav className="dashboard-tiles" aria-label={t("summary")}>
        {tiles.map(({ key, href }) => {
          const label = shellT(key);
          return (
            <article className="dashboard-tile" key={key}>
              <Link className="dashboard-tile-link" href={href}>
                <span>{label}</span>
              </Link>
              <SpeakerButton text={label} phraseId={`driver-tile-${key}`} />
            </article>
          );
        })}
      </nav>

      {error && (
        <div className="inline-alert" role="alert">
          <span>{t("loadError")}</span>
          <button type="button" className="auth-resend" onClick={() => {
            setLoading(true);
            setReload((value) => value + 1);
          }}>{t("retry")}</button>
        </div>
      )}

      <section className="dashboard-card" aria-labelledby="nearest-station-title">
        <div className="dashboard-card-heading">
          <h2 id="nearest-station-title">{t("nearestTitle")}</h2>
          <SpeakerButton
            text={data?.nearestStation
              ? `${data.nearestStation.name}. ${statusLabel(data.nearestStation.availability.state)}. ${t("distance", { distance: number.format(data.nearestStation.distanceKm) })}. ${t("source", { source: reportSource(data.nearestStation.availability.source) })}`
              : `${t("nearestTitle")}. ${t("unknown")}.`}
            phraseId="driver-nearest-station"
          />
        </div>
        {loading ? (
          <div className="dashboard-skeleton" aria-label={t("loading")} aria-busy="true" />
        ) : data?.nearestStation ? (
          <article className="nearest-station-card">
            <div
              className={`status-mark status-${data.nearestStation.availability.state}`}
              aria-label={statusLabel(data.nearestStation.availability.state)}
            >
              <span aria-hidden="true">{statusIcons[data.nearestStation.availability.state]}</span>
              <strong>{statusLabel(data.nearestStation.availability.state)}</strong>
            </div>
            <h3><Link href={`/app/stations/${data.nearestStation.id}`}>{data.nearestStation.name}</Link></h3>
            <p>{t("distance", { distance: number.format(data.nearestStation.distanceKm) })}</p>
            <p>
              {data.nearestStation.availability.reportedAt
                ? t("age", { age: dateTime(data.nearestStation.availability.reportedAt) })
                : t("noReportTime")}
            </p>
            <p>{t("source", { source: reportSource(data.nearestStation.availability.source) })}</p>
            {data.nearestStation.isDemo && <span className="demo-badge">⚠ {t("demo")}</span>}
            <Link className="directions-link" href="/app/stations">{t("seeStations")}</Link>
          </article>
        ) : (
          <>
            <p className="status-mark status-unknown"><span aria-hidden="true">?</span><strong>{t("unknown")}</strong></p>
            <p className="empty-state">{t("noStation")}</p>
          </>
        )}
      </section>

      {data?.activeRequest && (
        <section className="dashboard-card active-request-card">
          <h2>{t("activeRequestTitle")}</h2>
          <p>{t("serviceLabel", { service: t(`services.${data.activeRequest.service_type}`) })}</p>
          <p>{t(`requestStatuses.${data.activeRequest.status}`)}</p>
          <Link href={`/app/help/${data.activeRequest.id}`}>{t("viewRequest")}</Link>
        </section>
      )}

      <section className="dashboard-card">
        <h2>{t("monthlySpend")}</h2>
        {loading ? (
          <div className="dashboard-skeleton" aria-busy="true" />
        ) : data?.monthlySpend !== null && data?.monthlySpend !== undefined ? (
          <p className="dashboard-big-number">
            {t("monthlySpendValue", { amount: number.format(data.monthlySpend) })}
          </p>
        ) : (
          <p className="empty-state">{t("monthlySpendEmpty")} <Link href="/app/vehicle/log">{t("addFuelLog")}</Link></p>
        )}
        <h3>{t("kmPerLitre")}</h3>
        {loading
          ? <div className="dashboard-skeleton" aria-busy="true" />
          : data?.kmPerLitre
          ? <p className="dashboard-big-number">{t("kmPerLitreValue", { value: number.format(data.kmPerLitre) })}</p>
          : <p className="empty-state">{t("kmPerLitreEmpty")}</p>}
      </section>

      <section className="dashboard-card official-price-card">
        <h2>{t("officialPrice")}</h2>
        {data?.officialPrice ? (
          <>
            <p>{t("officialPriceLine", {
              price: number.format(data.officialPrice.pricePerLitre),
              date: dateTime(data.officialPrice.effectiveAt),
              time: dateTime(data.officialPrice.checkedAt),
            })}</p>
            <p>{t("source", { source: data.officialPrice.source })}</p>
            {data.officialPrice.isDemo && <span className="demo-badge">⚠ {t("demo")}</span>}
          </>
        ) : <p className="empty-state">{t("officialPriceUnknown")}</p>}
      </section>
    </main>
  );
}
