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
  assigned_provider_id: string | null;
  can_accept?: boolean;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
};

export function ProviderDashboard() {
  const t = useTranslations("dashboard.provider");
  const [requests, setRequests] = useState<ProviderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyKey, setBusyKey] = useState("");

  async function act(requestId: string, action: "accept" | "decline" | "en_route" | "completed") {
    setBusyKey(`${requestId}:${action}`);
    try {
      const response = await fetch(`/api/dashboard/provider/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("Request action failed.");
      setRequests((current) => action === "decline" ? current.filter((item) => item.id !== requestId) : current.map((item) => item.id === requestId ? { ...item, status: action === "accept" ? "confirmed" : action } : item));
    } catch (actionError) {
      console.error("Provider request action failed", actionError);
      setError(true);
    } finally {
      setBusyKey("");
    }
  }

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
                {request.notes && <p>{request.notes}</p>}
                <div className="provider-request-actions">
                  {request.status === "requested" && (!request.assigned_provider_id || request.can_accept) && <>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void act(request.id, "accept")}>{t("accept")}</button>
                    <button type="button" disabled={Boolean(busyKey)} onClick={() => void act(request.id, "decline")}>{t("decline")}</button>
                  </>}
                  {request.status === "confirmed" && request.assigned_provider_id && <button type="button" disabled={Boolean(busyKey)} onClick={() => void act(request.id, "en_route")}>{t("enRoute")}</button>}
                  {request.status === "en_route" && request.assigned_provider_id && <button type="button" disabled={Boolean(busyKey)} onClick={() => void act(request.id, "completed")}>{t("completed")}</button>}
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
        <p className="helper-note">{t("locationPrivate")}</p>
      </section>
    </main>
  );
}
