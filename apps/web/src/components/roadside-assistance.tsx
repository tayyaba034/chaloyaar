"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

type ServiceType = "puncture" | "battery" | "towing";
type Request = {
  id: string;
  service_type: ServiceType;
  status: string;
  latitude: number;
  longitude: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_demo: boolean;
};

const services: ServiceType[] = ["puncture", "battery", "towing"];

export function RoadsideAssistance({ requestId }: { requestId?: string }) {
  const t = useTranslations("dashboard.driver");
  const router = useRouter();
  const [request, setRequest] = useState<Request | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType>("puncture");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(Boolean(requestId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const loadRequest = () => fetch(`/api/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Request could not be loaded.");
        return (await response.json()) as { request: Request };
      })
      .then((result) => {
        if (active) setRequest(result.request);
      })
      .catch((error: unknown) => {
        console.error("Roadside request could not be loaded", error);
        if (active) setMessage(t("requestLoadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    void loadRequest();
    const interval = window.setInterval(() => void loadRequest(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [requestId, t]);

  async function createRequest() {
    if (!navigator.geolocation) {
      setMessage(t("locationUnavailable"));
      return;
    }
    setBusy(true);
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceType,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              notes,
            }),
          });
          const result = (await response.json()) as { request?: Request; error?: { message?: string } };
          if (!response.ok || !result.request) throw new Error(result.error?.message ?? t("requestCreateError"));
          router.replace(`/app/help/${result.request.id}`);
          router.refresh();
        } catch (error) {
          console.error("Roadside request could not be created", error);
          setMessage(t("requestCreateError"));
        } finally {
          setBusy(false);
        }
      },
      (error) => {
        console.error("Roadside request location failed", error);
        setMessage(t("locationDenied"));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function cancelRequest() {
    if (!request) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/requests/${request.id}`, { method: "POST" });
      if (!response.ok) throw new Error("Request could not be cancelled.");
      const result = (await response.json()) as { request: Request };
      setRequest(result.request);
    } catch (error) {
      console.error("Roadside request could not be cancelled", error);
      setMessage(t("requestCancelError"));
    } finally {
      setBusy(false);
    }
  }

  if (requestId) {
    return (
      <main className="dashboard-page">
        <Link className="back-link" href="/app/help">← {t("backToHelp")}</Link>
        <section className="dashboard-card" aria-labelledby="request-title">
          {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : request ? (
            <>
              <h1 id="request-title">{t("requestDetails")}</h1>
              <p className="status-mark status-available"><strong>{t(`requestStatuses.${request.status}`)}</strong></p>
              <p>{t("serviceLabel", { service: t(`services.${request.service_type}`) })}</p>
              <p>{t("requestCreated", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.created_at)) })}</p>
              {request.notes && <p>{request.notes}</p>}
              {request.status === "requested" || request.status === "confirmed" ? (
                <button type="button" className="cy-button cy-button--outline" disabled={busy} onClick={() => void cancelRequest()}>
                  {busy ? t("working") : t("cancelRequest")}
                </button>
              ) : null}
            </>
          ) : <p className="inline-alert" role="alert">{message}</p>}
          {message && request && <p className="inline-alert" role="alert">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <p className="eyebrow">{t("summary")}</p>
        <h1>{t("helpTitle")}</h1>
      </section>
      <section className="dashboard-card" aria-labelledby="help-form-title">
        <h2 id="help-form-title">{t("helpFormTitle")}</h2>
        <p>{t("locationHelp")}</p>
        <div className="cy-station-filter-row" role="group" aria-label={t("serviceTypeLabel")}>
          {services.map((service) => (
            <button key={service} type="button" className={`cy-station-filter${serviceType === service ? " is-selected" : ""}`} aria-pressed={serviceType === service} onClick={() => setServiceType(service)}>
              {t(`services.${service}`)}
            </button>
          ))}
        </div>
        <label className="cy-field">
          <span>{t("notesLabel")}</span>
          <textarea value={notes} maxLength={500} onChange={(event) => setNotes(event.currentTarget.value)} />
        </label>
        {message && <p className="inline-alert" role="alert">{message}</p>}
        <button type="button" className="cy-button cy-button--accent" disabled={busy} onClick={() => void createRequest()}>
          {busy ? t("working") : t("sendRequest")}
        </button>
      </section>
    </main>
  );
}
