"use client";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, PaperPlaneTilt, Phone } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { canRequestConfirmation, type AvailabilityState } from "@/lib/availability-machine";
import { AvailabilityBadge, AvailabilityLegend, type AvailabilityView } from "./availability-badge";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import { TrueCostMap } from "./truecost-map";
import "./trip-planner.css";

type Details = {
  business: { id: string; name: string; category: string; description: string | null; address: string | null; phone: string | null; latitude: number; longitude: number; listingStatus: string; isDemo: boolean; source: string; publishedHoursText: string | null };
  availability: AvailabilityView;
  services: Array<{ id: string; name: string; description: string | null; durationMinutes: number; priceNote: string | null; availability: AvailabilityView }>;
  hours: Array<{ weekday: number; opensAt: string; closesAt: string; closesNextDay: boolean; isClosed: boolean; validOn: string | null; source: string }>;
  alternatives: Array<{ id: string; name: string; distanceKm: number | null; isDemo: boolean; availability: AvailabilityView }>;
};
type MyRequest = { id: string; business_id: string; status: string; question: string; requested_at: string; response_note: string | null; failure_reason: string | null };

export function BusinessDetail({ businessId }: { businessId: string }) {
  const t = useTranslations("places");
  const [details, setDetails] = useState<Details | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ status: string; failure: string | null } | null>(null);
  const [sendFailure, setSendFailure] = useState<ApiFailure | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/businesses/${businessId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setFailure(await readFailure(response));
        setFailure(null);
        setDetails(await response.json());
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    fetch("/api/confirmations", { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? setRequests(((await response.json()).requests as MyRequest[]).filter((item) => item.business_id === businessId)) : undefined))
      .catch(() => undefined);
    return () => controller.abort();
  }, [businessId, reload, t]);

  const selectedService = details?.services.find((service) => service.id === serviceId);
  const state: AvailabilityState = (selectedService?.availability ?? details?.availability)?.state ?? "UNKNOWN";
  const markers = useMemo(() => details ? [{ name: details.business.name, latitude: details.business.latitude, longitude: details.business.longitude, address: details.business.address }] : [], [details]);

  async function send() {
    if (!details || sending) return;
    setSending(true);
    setSendFailure(null);
    try {
      const response = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId, serviceId: serviceId || null, question: question.trim() || t("defaultQuestion", { service: selectedService?.name ?? t(`categories.${details.business.category}`) }) }),
      });
      if (response.status === 401) return setNeedsSignIn(true);
      if (!response.ok) return setSendFailure(await readFailure(response));
      setSendResult(await response.json());
      setReload((value) => value + 1);
    } catch {
      setSendFailure({ message: t("offline") });
    } finally {
      setSending(false);
    }
  }

  if (failure) return <main className="driver-page tp-page"><SetupNotice failure={failure} /></main>;
  if (!details) return <main className="driver-page tp-page"><div className="driver-loading" role="status">{t("loading")}</div></main>;
  const { business } = details;
  return (
    <main className="driver-page tp-page">
      <Link href="/app/places" className="driver-secondary tp-back"><ArrowLeft aria-hidden="true" />{t("back")}</Link>
      <div className="driver-page-heading">
        <div>
          <h1>{business.name}</h1>
          <p className="driver-small">
            {t(`categories.${business.category}`)}{business.address && ` · ${business.address}`}
            {business.isDemo && <span className="tp-demo"> {t("demo")}</span>}
            {business.listingStatus === "unclaimed" && <span className="tp-tag"> {t("unclaimed")}</span>}
          </p>
        </div>
      </div>
      {business.isDemo && <p className="driver-message">{t("demoNotice")}</p>}
      <section className="tp-card">
        <h2>{t("availabilityTitle")}</h2>
        <AvailabilityBadge availability={details.availability} />
        {details.availability.explanation && <p className="driver-small">{details.availability.explanation}</p>}
        <AvailabilityLegend />
      </section>

      <section className="tp-card">
        <h2>{t("requestTitle")}</h2>
        <p className="driver-small">{t("requestIntro")}</p>
        {details.services.length > 0 && (
          <label>{t("service")}
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              <option value="">{t("anyService")}</option>
              {details.services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
        )}
        <label>{t("question")}
          <input value={question} maxLength={200} placeholder={t("defaultQuestion", { service: selectedService?.name ?? t(`categories.${business.category}`) })} onChange={(event) => setQuestion(event.target.value)} />
        </label>
        <div className="driver-actions">
          <button type="button" className="driver-primary" disabled={sending || !canRequestConfirmation(state)} onClick={send}><PaperPlaneTilt aria-hidden="true" />{sending ? t("sending") : t("sendRequest")}</button>
          {business.phone && <a className="driver-secondary" href={`tel:${business.phone.replace(/[^+0-9]/g, "")}`}><Phone aria-hidden="true" />{t("call")}</a>}
        </div>
        {!canRequestConfirmation(state) && <p className="driver-small">{t(state === "PENDING_CONFIRMATION" ? "alreadyPending" : "closedNoRequest")}</p>}
        {needsSignIn && <p className="driver-message">{t("signInToRequest")} <Link href={`/auth/sign-in?next=/app/places/${businessId}`}>{t("signIn")}</Link></p>}
        {sendResult && <p className={`driver-message${sendResult.status === "requested" ? "" : " driver-error"}`} role="status">{sendResult.status === "requested" ? t("requestSent") : sendResult.failure}</p>}
        {sendFailure && <SetupNotice failure={sendFailure} />}
        {requests.length > 0 && (
          <ul className="tp-requests">
            {requests.slice(0, 5).map((request) => (
              <li key={request.id}><strong>{t(`requestStatus.${request.status}`)}</strong> · {request.question}{request.response_note && ` — “${request.response_note}”`}{request.failure_reason && ` — ${request.failure_reason}`}</li>
            ))}
          </ul>
        )}
      </section>

      {details.services.length > 0 && (
        <section className="tp-card">
          <h2>{t("servicesTitle")}</h2>
          <ul className="tp-list">
            {details.services.map((service) => (
              <li key={service.id}>
                <strong>{service.name}</strong> <span className="driver-small">· {t("minutes", { minutes: service.durationMinutes })}{service.priceNote && ` · ${service.priceNote}`}</span>
                <AvailabilityBadge availability={service.availability} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="tp-card">
        <h2>{t("hoursTitle")}</h2>
        <p className="driver-small">{t("hoursNote")}</p>
        {details.hours.length ? (
          <ul className="tp-list">
            {details.hours.filter((row) => !row.validOn).map((row, index) => (
              <li key={index}>{t(`weekdays.${row.weekday}`)}: {row.isClosed ? t("closed") : `${row.opensAt}–${row.closesAt}${row.closesNextDay ? ` ${t("nextDay")}` : ""}`} <span className="driver-small">({t(`hoursSource.${row.source}`)})</span></li>
            ))}
          </ul>
        ) : business.publishedHoursText ? <p>{t("publishedHours", { hours: business.publishedHoursText })}</p> : <p className="driver-empty">{t("noHours")}</p>}
      </section>

      <section className="tp-card">
        <div className="tp-map"><TrueCostMap center={{ latitude: business.latitude, longitude: business.longitude }} markers={markers} /></div>
      </section>

      {details.alternatives.length > 0 && (
        <section className="tp-card">
          <h2>{t("alternativesTitle")}</h2>
          <ul className="tp-list">
            {details.alternatives.map((alternative) => (
              <li key={alternative.id}>
                <Link href={`/app/places/${alternative.id}`}>{alternative.name}</Link>
                {alternative.isDemo && <span className="tp-demo"> {t("demo")}</span>}
                {alternative.distanceKm !== null && <span className="driver-small"> · {t("distanceFromHere", { km: alternative.distanceKm.toFixed(1) })}</span>}
                <AvailabilityBadge availability={alternative.availability} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
