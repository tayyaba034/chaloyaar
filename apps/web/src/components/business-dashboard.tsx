"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle, Plus, Storefront, XCircle } from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { AvailabilityBadge, type AvailabilityView } from "./availability-badge";
import { PlaceSearch, placeName } from "./place-search";
import { categories } from "./business-search";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import "./trip-planner.css";

type Membership = { id: string; role: string; status: string; business_id: string; businesses: { id: string; name: string; category: string; listing_status: string; is_demo: boolean; address: string | null } | null };
type Dashboard = {
  role: "owner" | "staff";
  business: { id: string; name: string; category: string; description: string | null; phone: string | null; address: string | null; latitude: number; longitude: number; listing_status: string; is_demo: boolean };
  availability: { state: string; source: string | null; submitted_at: string | null; effective_until: string | null; explanation: string | null } | null;
  services: Array<{ id: string; name: string; tag: string | null; duration_minutes: number; price_note: string | null; is_active: boolean }>;
  hours: Array<{ id: string; weekday: number; opens_at: string; closes_at: string; is_closed: boolean; valid_on: string | null; source: string }>;
  requests: Array<{ id: string; service_id: string | null; status: string; question: string; requested_at: string; expires_at: string; response_note: string | null; is_demo: boolean; profiles: { display_name: string | null } | null }>;
  appointments: Array<{ id: string; status: string; window_start: string; window_end: string; note: string | null; decision_note: string | null; profiles: { display_name: string | null } | null }>;
  staff: Array<{ id: string; role: string; status: string; profiles: { display_name: string | null } | null }>;
  updates: Array<{ id: string; state: string; source: string; note: string | null; submitter_role: string; submitted_at: string; valid_until: string | null; part_available: boolean | null; part_label: string | null; resource_label: string | null; service_id: string | null }>;
  audit: Array<{ id: number; action: string; entity_type: string; created_at: string }>;
};
const tabs = ["status", "requests", "services", "hours", "details", "staff", "activity"] as const;
type Tab = (typeof tabs)[number];
const time = (iso: string) => new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function send(url: string, body: unknown, method: "POST" | "PATCH"): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; failure: ApiFailure }> {
  try {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) return { ok: false, failure: await readFailure(response) };
    return { ok: true, data: await response.json() };
  } catch {
    return { ok: false, failure: { message: "offline" } };
  }
}

export function BusinessDashboard() {
  const t = useTranslations("business");
  const placesT = useTranslations("places");
  const availabilityT = useTranslations("availability");
  const locale = useLocale();
  const router = useRouter();
  const search = useSearchParams();
  const selected = search.get("b");
  const tab = (tabs as readonly string[]).includes(search.get("tab") ?? "") ? (search.get("tab") as Tab) : "status";
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [actionFailure, setActionFailure] = useState<ApiFailure | null>(null);
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const reload = () => setRefresh((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/business", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setFailure(await readFailure(response));
        setFailure(null);
        setMemberships((await response.json()).memberships);
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    return () => controller.abort();
  }, [refresh, t]);

  const activeId = selected ?? memberships?.find((membership) => membership.status === "active")?.business_id ?? null;
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    fetch(`/api/business/${activeId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setActionFailure(await readFailure(response));
        setDashboard(await response.json());
      })
      .catch(() => undefined);
    const timer = window.setInterval(reload, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [activeId, refresh]);

  async function act(url: string, body: unknown, success: string, method: "POST" | "PATCH" = "POST") {
    setActionFailure(null);
    setMessage("");
    const result = await send(url, body, method);
    if (!result.ok) return setActionFailure(result.failure.message === "offline" ? { message: t("offline") } : result.failure);
    setMessage(success);
    reload();
  }
  const go = (patch: Record<string, string>) => {
    const params = new URLSearchParams(search.toString());
    Object.entries(patch).forEach(([key, value]) => params.set(key, value));
    router.replace(`/app/business?${params}`);
  };

  if (failure) return <main className="driver-page tp-page"><h1>{t("title")}</h1><SetupNotice failure={failure} /></main>;
  if (!memberships) return <main className="driver-page tp-page"><div className="driver-loading" role="status">{t("loading")}</div></main>;

  return (
    <main className="driver-page tp-page">
      <div className="driver-page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="driver-small">{t("subtitle")}</p>
        </div>
      </div>
      {memberships.length > 0 && (
        <nav className="tp-card bd-switch" aria-label={t("yourBusinesses")}>
          {memberships.map((membership) => (
            <button type="button" key={membership.id} className={membership.business_id === activeId ? "driver-primary" : "driver-secondary"}
              disabled={membership.status !== "active"} onClick={() => go({ b: membership.business_id, tab: "status" })}>
              <Storefront aria-hidden="true" />{membership.businesses?.name ?? t("business")}
              <small>{membership.status === "pending" ? t("claimPending") : t(`listing.${membership.businesses?.listing_status ?? "active"}`)}</small>
            </button>
          ))}
        </nav>
      )}
      {message && <p className="driver-message" role="status">{message}</p>}
      {actionFailure && <SetupNotice failure={actionFailure} />}

      {dashboard && dashboard.business.id === activeId && (
        <>
          {dashboard.business.is_demo && <p className="driver-message">{placesT("demoNotice")}</p>}
          {dashboard.business.listing_status === "pending_review" && <p className="driver-message">{t("pendingReview")}</p>}
          <div className="bd-tabs" role="tablist">
            {tabs.map((value) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : ""} onClick={() => go({ tab: value })}>
                {t(`tabs.${value}`)}
                {value === "requests" && dashboard.requests.filter((request) => request.status === "requested").length > 0 && <span className="bd-count">{dashboard.requests.filter((request) => request.status === "requested").length}</span>}
              </button>
            ))}
          </div>
          {tab === "status" && <StatusTab dashboard={dashboard} onAct={act} />}
          {tab === "requests" && (
            <section className="tp-card">
              <h2>{t("requestsTitle")}</h2>
              <p className="driver-small">{t("requestsIntro")}</p>
              {!dashboard.requests.length && !dashboard.appointments.length && <p className="driver-empty">{t("noRequests")}</p>}
              <ul className="tp-list">
                {dashboard.requests.map((request) => (
                  <li key={request.id} className="bd-request">
                    <strong>{request.question}</strong>
                    <span className="driver-small">{request.profiles?.display_name ?? t("aDriver")} · {time(request.requested_at)} · {placesT(`requestStatus.${request.status}`)}</span>
                    {request.status === "requested" && (
                      <div className="driver-actions">
                        <button type="button" className="driver-primary" onClick={() => act("/api/business/respond", { kind: "confirmation", requestId: request.id, available: true, until: inHours(3) }, t("answered"))}><CheckCircle aria-hidden="true" />{t("yesAvailable")}</button>
                        <button type="button" className="driver-secondary" onClick={() => act("/api/business/respond", { kind: "confirmation", requestId: request.id, available: false }, t("answered"))}><XCircle aria-hidden="true" />{t("notAvailable")}</button>
                      </div>
                    )}
                    {request.response_note && <span className="driver-small">“{request.response_note}”</span>}
                  </li>
                ))}
                {dashboard.appointments.map((appointment) => (
                  <li key={appointment.id} className="bd-request">
                    <strong>{t("appointment", { from: time(appointment.window_start) })}</strong>
                    <span className="driver-small">{appointment.profiles?.display_name ?? t("aDriver")} · {t(`appointmentStatus.${appointment.status}`)}{appointment.note && ` · ${appointment.note}`}</span>
                    {appointment.status === "pending" && (
                      <div className="driver-actions">
                        <button type="button" className="driver-primary" onClick={() => act("/api/business/respond", { kind: "appointment", appointmentId: appointment.id, decision: "confirmed" }, t("answered"))}>{t("confirmAppointment")}</button>
                        <button type="button" className="driver-secondary" onClick={() => act("/api/business/respond", { kind: "appointment", appointmentId: appointment.id, decision: "declined" }, t("answered"))}>{t("declineAppointment")}</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tab === "services" && <ServicesTab dashboard={dashboard} onAct={act} />}
          {tab === "hours" && <HoursTab dashboard={dashboard} onAct={act} />}
          {tab === "details" && <DetailsTab dashboard={dashboard} onAct={act} />}
          {tab === "staff" && (
            <section className="tp-card">
              <h2>{t("staffTitle")}</h2>
              <ul className="tp-list">
                {dashboard.staff.map((member) => (
                  <li key={member.id}>
                    {member.profiles?.display_name ?? t("member")} · {t(`roles.${member.role}`)}
                    {dashboard.role === "owner" && member.role !== "owner" && <button type="button" className="driver-secondary" onClick={() => act("/api/business/respond", { kind: "remove_staff", membershipId: member.id }, t("saved"))}>{t("remove")}</button>}
                  </li>
                ))}
              </ul>
              {dashboard.role === "owner" && <StaffForm businessId={dashboard.business.id} onAct={act} />}
            </section>
          )}
          {tab === "activity" && (
            <section className="tp-card">
              <h2>{t("activityTitle")}</h2>
              <p className="driver-small">{t("activityIntro")}</p>
              <ul className="tp-list">
                {dashboard.updates.map((update) => (
                  <li key={update.id}>
                    <span>{availabilityT(`states.${update.state}.label`)} · {availabilityT(`sources.${update.source}`)} · {t(`roles.${update.submitter_role}`)} · {time(update.submitted_at)}</span>
                    {update.note && <span className="driver-small">“{update.note}”</span>}
                  </li>
                ))}
                {dashboard.audit.map((entry) => <li key={entry.id} className="driver-small">{time(entry.created_at)} · {entry.action} · {entry.entity_type}</li>)}
              </ul>
            </section>
          )}
        </>
      )}

      <RegisterForm locale={locale} onAct={act} />
      <section className="tp-card">
        <h2>{t("claimTitle")}</h2>
        <p className="driver-small">{t("claimIntro")}</p>
        <Link className="driver-secondary" href="/app/places">{t("findListing")}</Link>
      </section>
    </main>
  );
}

type Act = (url: string, body: unknown, success: string, method?: "POST" | "PATCH") => Promise<void>;

function StatusTab({ dashboard, onAct }: { dashboard: Dashboard; onAct: Act }) {
  const t = useTranslations("business");
  const [serviceId, setServiceId] = useState("");
  const [note, setNote] = useState("");
  const [reopen, setReopen] = useState(2);
  const [partLabel, setPartLabel] = useState("");
  const availability: AvailabilityView | null = dashboard.availability ? {
    state: dashboard.availability.state as AvailabilityView["state"], source: dashboard.availability.source,
    submittedAt: dashboard.availability.submitted_at, until: dashboard.availability.effective_until,
  } : null;
  const url = `/api/business/${dashboard.business.id}/status`;
  const base = { serviceId: serviceId || null, note: note || undefined };
  return (
    <section className="tp-card">
      <h2>{t("statusTitle")}</h2>
      {availability && <AvailabilityBadge availability={availability} />}
      <p className="driver-small">{t("statusIntro")}</p>
      {dashboard.services.length > 0 && (
        <label>{t("forService")}
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
            <option value="">{t("wholeBusiness")}</option>
            {dashboard.services.filter((service) => service.is_active).map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        </label>
      )}
      <label>{t("noteLabel")}<input value={note} maxLength={300} placeholder={t("notePlaceholder")} onChange={(event) => setNote(event.target.value)} /></label>
      <div className="bd-status-grid">
        <button type="button" className="driver-primary" onClick={() => onAct(url, { ...base, state: "CONFIRMED", until: inHours(2) }, t("statusSaved"))}>{t("readyNow")}</button>
        <button type="button" className="driver-secondary" onClick={() => onAct(url, { ...base, state: "UNAVAILABLE", label: t("fullyBooked") }, t("statusSaved"))}>{t("fullyBooked")}</button>
        <button type="button" className="driver-secondary" onClick={() => onAct(url, { ...base, state: "UNAVAILABLE" }, t("statusSaved"))}>{t("notAvailableNow")}</button>
        <span className="bd-inline">
          <button type="button" className="driver-secondary" onClick={() => onAct(url, { serviceId: null, note: note || undefined, state: "TEMPORARILY_CLOSED", until: inHours(reopen) }, t("statusSaved"))}>{t("closeFor")}</button>
          <select aria-label={t("closeFor")} value={reopen} onChange={(event) => setReopen(Number(event.target.value))}>
            {[1, 2, 4, 8, 24].map((hours) => <option key={hours} value={hours}>{t("hours", { hours })}</option>)}
          </select>
        </span>
      </div>
      <div className="bd-inline">
        <input aria-label={t("partLabel")} placeholder={t("partLabel")} value={partLabel} maxLength={80} onChange={(event) => setPartLabel(event.target.value)} />
        <button type="button" className="driver-secondary" disabled={!partLabel.trim()} onClick={() => onAct(url, { ...base, state: "CONFIRMED", partAvailable: true, partLabel, until: inHours(4) }, t("statusSaved"))}>{t("partInStock")}</button>
        <button type="button" className="driver-secondary" disabled={!partLabel.trim()} onClick={() => onAct(url, { ...base, state: "UNAVAILABLE", partAvailable: false, partLabel }, t("statusSaved"))}>{t("partOut")}</button>
      </div>
      <p className="driver-small">{t("statusAudit")}</p>
    </section>
  );
}

function ServicesTab({ dashboard, onAct }: { dashboard: Dashboard; onAct: Act }) {
  const t = useTranslations("business");
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [priceNote, setPriceNote] = useState("");
  return (
    <section className="tp-card">
      <h2>{t("servicesTitle")}</h2>
      <ul className="tp-list">
        {dashboard.services.map((service) => (
          <li key={service.id}>
            <span><strong>{service.name}</strong> · {t("minutes", { minutes: service.duration_minutes })}{service.price_note && ` · ${service.price_note}`}{!service.is_active && ` · ${t("hidden")}`}</span>
            <button type="button" className="driver-secondary" onClick={() => onAct("/api/business/respond", { kind: "service", serviceId: service.id, isActive: !service.is_active }, t("saved"))}>{service.is_active ? t("hide") : t("show")}</button>
          </li>
        ))}
      </ul>
      <div className="driver-form-grid">
        <label>{t("serviceName")}<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
        <label>{t("serviceMinutes")}<input type="number" min={1} max={480} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label>
        <label>{t("priceNote")}<input value={priceNote} maxLength={120} placeholder={t("priceNotePlaceholder")} onChange={(event) => setPriceNote(event.target.value)} /></label>
      </div>
      <button type="button" className="driver-primary" disabled={name.trim().length < 2} onClick={() => { void onAct(`/api/business/${dashboard.business.id}/services`, { name, durationMinutes: minutes, priceNote: priceNote || null }, t("saved")); setName(""); setPriceNote(""); }}><Plus aria-hidden="true" />{t("addService")}</button>
    </section>
  );
}

function HoursTab({ dashboard, onAct }: { dashboard: Dashboard; onAct: Act }) {
  const t = useTranslations("business");
  const placesT = useTranslations("places");
  const initial = Array.from({ length: 7 }, (_, weekday) => {
    const row = dashboard.hours.find((hour) => hour.weekday === weekday && hour.source === "owner" && !hour.valid_on);
    return { weekday, opensAt: row?.opens_at.slice(0, 5) ?? "09:00", closesAt: row?.closes_at.slice(0, 5) ?? "18:00", isClosed: row ? row.is_closed : true };
  });
  const [rows, setRows] = useState(initial);
  const update = (weekday: number, patch: Partial<(typeof rows)[number]>) => setRows(rows.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row)));
  return (
    <section className="tp-card">
      <h2>{t("hoursTitle")}</h2>
      <p className="driver-small">{placesT("hoursNote")}</p>
      <ul className="tp-list">
        {rows.map((row) => (
          <li key={row.weekday} className="bd-hours-row">
            <strong>{placesT(`weekdays.${row.weekday}`)}</strong>
            <label className="driver-check"><input type="checkbox" checked={!row.isClosed} onChange={(event) => update(row.weekday, { isClosed: !event.target.checked })} />{t("open")}</label>
            <input type="time" aria-label={t("opens")} value={row.opensAt} disabled={row.isClosed} onChange={(event) => update(row.weekday, { opensAt: event.target.value })} />
            <input type="time" aria-label={t("closes")} value={row.closesAt} disabled={row.isClosed} onChange={(event) => update(row.weekday, { closesAt: event.target.value })} />
          </li>
        ))}
      </ul>
      <button type="button" className="driver-primary" onClick={() => onAct(`/api/business/${dashboard.business.id}/hours`, { rows: rows.filter((row) => !row.isClosed) }, t("saved"))}>{t("saveHours")}</button>
    </section>
  );
}

function DetailsTab({ dashboard, onAct }: { dashboard: Dashboard; onAct: Act }) {
  const t = useTranslations("business");
  const locale = useLocale();
  const [form, setForm] = useState({ name: dashboard.business.name, description: dashboard.business.description ?? "", phone: dashboard.business.phone ?? "", address: dashboard.business.address ?? "", latitude: Number(dashboard.business.latitude), longitude: Number(dashboard.business.longitude) });
  if (dashboard.role !== "owner") return <section className="tp-card"><p>{t("ownerOnly")}</p></section>;
  return (
    <section className="tp-card">
      <h2>{t("detailsTitle")}</h2>
      <div className="driver-form-grid">
        <label>{t("name")}<input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>{t("phone")}<input value={form.phone} maxLength={30} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>{t("address")}<input value={form.address} maxLength={300} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
        <label>{t("description")}<textarea value={form.description} maxLength={1000} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
      </div>
      <PlaceSearch label={t("moveLocation")} onSelect={(place) => setForm({ ...form, latitude: place.latitude, longitude: place.longitude, address: form.address || placeName(place, locale) })} />
      <p className="driver-small">{t("locationNow", { lat: form.latitude.toFixed(5), lng: form.longitude.toFixed(5) })}</p>
      <button type="button" className="driver-primary" onClick={() => onAct(`/api/business/${dashboard.business.id}`, { ...form, description: form.description || null, address: form.address || null, phone: form.phone || null }, t("saved"), "PATCH")}>{t("saveDetails")}</button>
    </section>
  );
}

function StaffForm({ businessId, onAct }: { businessId: string; onAct: Act }) {
  const t = useTranslations("business");
  const [email, setEmail] = useState("");
  return (
    <div className="bd-inline">
      <input type="email" aria-label={t("staffEmail")} placeholder={t("staffEmail")} value={email} onChange={(event) => setEmail(event.target.value)} />
      <button type="button" className="driver-primary" disabled={!email.includes("@")} onClick={() => { void onAct(`/api/business/${businessId}/staff`, { email }, t("saved")); setEmail(""); }}>{t("addStaff")}</button>
    </div>
  );
}

function RegisterForm({ locale, onAct }: { locale: string; onAct: Act }) {
  const t = useTranslations("business");
  const placesT = useTranslations("places");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "mechanic", phone: "", address: "" });
  const [location, setLocation] = useState<{ latitude: number; longitude: number; label: string; placeId: string | null } | null>(null);
  if (!open) return <button type="button" className="driver-secondary tp-back" onClick={() => setOpen(true)}><Plus aria-hidden="true" />{t("registerButton")}</button>;
  return (
    <section className="tp-card">
      <h2>{t("registerTitle")}</h2>
      <p className="driver-small">{t("registerIntro")}</p>
      <div className="driver-form-grid">
        <label>{t("name")}<input value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label>{placesT("category")}
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {categories.map((value) => <option key={value} value={value}>{placesT(`categories.${value}`)}</option>)}
          </select>
        </label>
        <label>{t("phone")}<input value={form.phone} maxLength={30} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
        <label>{t("address")}<input value={form.address} maxLength={300} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
      </div>
      <PlaceSearch label={t("locationLabel")} onSelect={(place) => setLocation({ latitude: place.latitude, longitude: place.longitude, label: placeName(place, locale), placeId: place.id })} />
      <p className="driver-small">{location ? t("locationChosen", { place: location.label }) : t("locationNeeded")}</p>
      <button type="button" className="driver-primary" disabled={!location || form.name.trim().length < 2} onClick={() => location && onAct("/api/business", {
        name: form.name, category: form.category, phone: form.phone, address: form.address || location.label,
        latitude: location.latitude, longitude: location.longitude, placeId: location.placeId,
      }, t("registered"))}>{t("register")}</button>
    </section>
  );
}
