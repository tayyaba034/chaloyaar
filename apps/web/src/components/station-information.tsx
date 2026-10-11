"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { Station } from "@/lib/station-data";

export type DiscoveryAvailability = {
  state: "available" | "unavailable" | "queue_reported" | "unknown" | "stale";
  source: "user" | "station" | "admin" | null;
  reportedAt: string | null;
  expiresAt: string | null;
};

export function StationInformation({ station, availability }: { station: Station; availability: DiscoveryAvailability }) {
  const t = useTranslations("stations.discovery");
  const locale = useLocale();
  const [expired, setExpired] = useState(false);
  const expiry = availability.expiresAt ? Date.parse(availability.expiresAt) : NaN;
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiry]);
  const state = expired && availability.state !== "unknown" ? "stale" : availability.state;
  const date = (value?: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value))
    : t("unknown");
  const verified = station.verificationStatus === "verified" && Boolean(station.verifiedAt);
  const sourceUrl = station.sourceUrl && /^https?:\/\//i.test(station.sourceUrl) ? station.sourceUrl : null;
  return (
    <div className="station-information">
      <div className="cy-station-badges">
        <span className={`cy-station-badge cy-station-badge--${state}`}>{t(`states.${state}`)}</span>
        <span className="cy-station-badge">{verified ? t("verified") : t("unverified")}</span>
      </div>
      <p>{t("fuels")}: {station.supportedFuels.length ? station.supportedFuels.map((fuel) => t(`fuelsNames.${fuel}`)).join(", ") : t("unknown")}</p>
      <p className="cy-station-source">{t("source")}: {station.source || t("unknown")}{sourceUrl && <> · <a href={sourceUrl} target="_blank" rel="noreferrer">{t("viewSource")}</a></>}</p>
      <p className="cy-station-source">{t("lastVerified")}: {verified ? date(station.verifiedAt) : t("notVerified")}</p>
      <p className="cy-station-source">{t("reportSource")}: {availability.source ? t(`sources.${availability.source}`) : t("unknown")} · {t("reportedAt")}: {date(availability.reportedAt)}{availability.expiresAt && <> · {t("expiresAt")}: {date(availability.expiresAt)}</>}</p>
      <p className="cy-station-source">{t("notGuaranteed")}</p>
    </div>
  );
}
