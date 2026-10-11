"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SpeakerButton } from "./speaker-button";

type ProviderRequest = {
  id: string;
  service_type: "puncture" | "battery" | "towing";
  status: "requested" | "quoted" | "confirmed" | "en_route" | "completed" | "cancelled";
  created_at: string;
  is_demo: boolean;
};

export function ProviderDashboard() {
  const t = useTranslations("dashboard.provider");
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/dashboard/provider", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Provider dashboard returned ${response.status}`);
        return (await response.json()) as { requests: ProviderRequest[] };
      })
      .then((result) => {
        if (active) {
          setRequests(result.requests);
          setError(false);
        }
      })
      .catch((loadError: unknown) => {
        console.error("Provider requests could not be loaded", loadError);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <h1>{t("homeTitle")}</h1>
        <SpeakerButton text={t("homeTitle")} phraseId="provider-dashboard-title" />
      </section>
      <p className="provider-verified-banner status-mark status-available">
        <span aria-hidden="true">✓</span><strong>{t("approvedBanner")}</strong>
      </p>
      <section className="dashboard-card">
        <div className="dashboard-card-heading">
          <h2>{t("today")}</h2>
          <SpeakerButton text={t("today")} phraseId="provider-today-requests" />
        </div>
        {error && <p className="inline-alert" role="alert">{t("loadError")}</p>}
        {loading ? (
          <div className="dashboard-skeleton" aria-label={t("loading")} aria-busy="true" />
        ) : requests.length ? (
          <ul className="provider-request-list">
            {requests.map((request) => (
              <li className="provider-request-card" key={request.id}>
                <h3>{t("serviceLabel", { service: t(`services.${request.service_type}`) })}</h3>
                <p>{t(`requestStatuses.${request.status}`)}</p>
                {request.is_demo && <span className="demo-badge">⚠ {t("demo")}</span>}
                <div className="provider-request-actions">
                  <button type="button" disabled>{t("accept")}</button>
                  <button type="button" disabled>{t("decline")}</button>
                  <button type="button" disabled>{t("enRoute")}</button>
                  <button type="button" disabled>{t("completed")}</button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">
            <span className="notice-icon" aria-hidden="true">🧰</span>
            <h3>{t("emptyTitle")}</h3>
            <p>{t("emptyMessage")}</p>
          </div>
        )}
        <p className="helper-note">{t("notReady")}</p>
        <p className="helper-note">{t("locationPrivate")}</p>
      </section>
    </main>
  );
}
