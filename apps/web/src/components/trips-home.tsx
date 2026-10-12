"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crosshair, Path, Sparkle } from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import { PlaceSearch, placeName } from "./place-search";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import { TrueCostMap } from "./truecost-map";
import "./trip-planner.css";

type Settings = {
  preferences: { km_per_litre: number | null; data_sharing_consent: boolean; default_vehicle_id: string | null } | null;
  price: { price_pkr_per_litre: number; source: string; set_at: string } | null;
  vehicles: Array<{ id: string; nickname: string; fuel_type: string; estimated_km_per_litre: number | null }>;
  officialReference: { price_per_litre: number; source_name: string; effective_at: string } | null;
};
type SavedPlace = { id: string; label: string; latitude: number; longitude: number };
type TripRow = { id: string; title: string | null; workflow_state: string; metrics: Record<string, unknown>; updated_at: string; is_demo: boolean };
type Origin = { latitude: number; longitude: number; label: string };
type TripView = { stops: Array<{ placeLabel: string | null; latitude: number | null; longitude: number | null; position: number; status: string }>; itinerary: { originLatitude: number | null; originLongitude: number | null } };

const pkr = (value: number) => `Rs ${Math.round(value).toLocaleString("en-PK")}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric" });

export function TripsHome() {
  const t = useTranslations("trips");
  const locale = useLocale();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [request, setRequest] = useState("");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [kmPerLitre, setKmPerLitre] = useState("");
  const [price, setPrice] = useState("");
  const [gpsMessage, setGpsMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<ApiFailure | null>(null);
  const [latest, setLatest] = useState<TripView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const get = (url: string) => fetch(url, { cache: "no-store", signal: controller.signal });
    Promise.all([get("/api/me/trip-settings"), get("/api/me/saved-places"), get("/api/trips")])
      .then(async ([settingsResponse, placesResponse, tripsResponse]) => {
        if (!settingsResponse.ok) return setFailure(await readFailure(settingsResponse));
        if (!tripsResponse.ok) return setFailure(await readFailure(tripsResponse));
        const loaded = await settingsResponse.json() as Settings;
        setSettings(loaded);
        const vehicle = loaded.vehicles.find((item) => item.id === loaded.preferences?.default_vehicle_id) ?? loaded.vehicles.find((item) => item.estimated_km_per_litre);
        setKmPerLitre(String(loaded.preferences?.km_per_litre ?? vehicle?.estimated_km_per_litre ?? ""));
        setPrice(loaded.price ? String(loaded.price.price_pkr_per_litre) : "");
        if (placesResponse.ok) {
          const saved = (await placesResponse.json()).places as SavedPlace[];
          setPlaces(saved);
          const home = saved[0];
          if (home) setOrigin({ latitude: Number(home.latitude), longitude: Number(home.longitude), label: home.label });
        }
        setTrips((await tripsResponse.json()).trips);
      })
      .catch(() => { if (!controller.signal.aborted) setFailure({ message: t("offline") }); });
    return () => controller.abort();
  }, [t]);

  const current = trips?.find((trip) => !["CANCELLED", "COMPLETED"].includes(trip.workflow_state)) ?? null;
  useEffect(() => {
    if (!current) return;
    const controller = new AbortController();
    fetch(`/api/trips/${current.id}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => (response.ok ? setLatest(await response.json()) : undefined))
      .catch(() => undefined);
    return () => controller.abort();
  }, [current]);

  const metrics = current?.metrics ?? {};
  const markers = useMemo(() => (latest?.stops ?? []).filter((stop) => stop.latitude !== null && stop.status === "planned")
    .sort((a, b) => a.position - b.position)
    .map((stop, index) => ({ name: `${index + 1}. ${stop.placeLabel ?? ""}`, latitude: stop.latitude!, longitude: stop.longitude! })), [latest]);
  const mapCenter = useMemo(() => (origin ? { latitude: origin.latitude, longitude: origin.longitude } : { latitude: 31.4181, longitude: 73.0791 }), [origin]);

  function useGps() {
    if (!navigator.geolocation) return setGpsMessage(t("gpsUnsupported"));
    setGpsMessage(t("gpsLocating"));
    navigator.geolocation.getCurrentPosition(
      (position) => { setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: t("myLocation") }); setGpsMessage(""); },
      (error) => setGpsMessage(error.code === error.PERMISSION_DENIED ? t("gpsDenied") : t("gpsFailed")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function plan() {
    if (busy || request.trim().length < 3) return;
    setBusy(true);
    setSubmitFailure(null);
    const efficiency = Number(kmPerLitre);
    const petrol = Number(price);
    try {
      if (petrol > 0 && petrol !== settings?.price?.price_pkr_per_litre) {
        await fetch("/api/me/trip-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricePkrPerLitre: petrol, ...(efficiency > 0 ? { kmPerLitre: efficiency } : {}) }) });
      }
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestText: request.trim(), origin, kmPerLitre: efficiency > 0 ? efficiency : null, pricePkrPerLitre: petrol > 0 ? petrol : null }),
      });
      if (!response.ok) return setSubmitFailure(await readFailure(response));
      const body = await response.json() as { id: string };
      router.push(`/app/trips/${body.id}`);
    } catch {
      setSubmitFailure({ message: t("offline") });
    } finally {
      setBusy(false);
    }
  }

  async function useOfficial() {
    if (!settings?.officialReference) return;
    setPrice(String(settings.officialReference.price_per_litre));
    await fetch("/api/me/trip-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pricePkrPerLitre: Number(settings.officialReference.price_per_litre), priceSource: "official_reference" }) }).catch(() => undefined);
  }

  async function setConsent(value: boolean) {
    await fetch("/api/me/trip-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataSharingConsent: value }) }).catch(() => undefined);
    setSettings((previous) => previous ? { ...previous, preferences: { ...(previous.preferences ?? { km_per_litre: null, default_vehicle_id: null }), data_sharing_consent: value } } : previous);
  }

  if (failure) return <main className="driver-page tp-page"><h1>{t("title")}</h1><SetupNotice failure={failure} /></main>;

  return (
    <main className="driver-page tp-page">
      <div className="driver-page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="driver-small">{t("subtitle")}</p>
        </div>
      </div>
      <section className="tp-card">
        <label>{t("requestLabel")}
          <textarea value={request} maxLength={1000} rows={3} placeholder={t("requestPlaceholder")} onChange={(event) => setRequest(event.target.value)} />
        </label>
        <button type="button" className="driver-secondary tp-back" onClick={() => setRequest(t("example"))}><Sparkle aria-hidden="true" />{t("useExample")}</button>
        <div className="tp-settings-grid">
          <div className="tp-field-group">
            <strong>{t("startFrom")}</strong>
            <p className="driver-small">{origin ? origin.label : t("noOrigin")}</p>
            {places.length > 0 && (
              <select aria-label={t("savedPlaces")} value="" onChange={(event) => {
                const place = places.find((item) => item.id === event.target.value);
                if (place) setOrigin({ latitude: Number(place.latitude), longitude: Number(place.longitude), label: place.label });
              }}>
                <option value="">{t("savedPlaces")}</option>
                {places.map((place) => <option key={place.id} value={place.id}>{place.label}</option>)}
              </select>
            )}
            <PlaceSearch label={t("searchPlace")} onSelect={(place) => setOrigin({ latitude: place.latitude, longitude: place.longitude, label: placeName(place, locale) })} />
            <button type="button" className="driver-secondary" onClick={useGps}><Crosshair aria-hidden="true" />{t("useGps")}</button>
            {gpsMessage && <span className="driver-small" role="status">{gpsMessage}</span>}
          </div>
          <div className="tp-field-group">
            <label>{t("efficiency")}
              <input type="number" min={1} max={200} step={0.1} inputMode="decimal" value={kmPerLitre} onChange={(event) => setKmPerLitre(event.target.value)} />
            </label>
            {settings?.vehicles.length ? <p className="driver-small">{t("vehiclesHint", { vehicles: settings.vehicles.map((vehicle) => `${vehicle.nickname}${vehicle.estimated_km_per_litre ? ` ${vehicle.estimated_km_per_litre} km/L` : ""}`).join(", ") })}</p> : <Link href="/app/vehicle" className="driver-small">{t("addVehicle")}</Link>}
            <label>{t("price")}
              <input type="number" min={1} max={5000} step={0.01} inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
            <p className="driver-small">{settings?.price ? t("priceSet", { date: day(settings.price.set_at), source: t(`priceSources.${settings.price.source}`) }) : t("priceMissing")}</p>
            {settings?.officialReference && (
              <button type="button" className="driver-secondary" onClick={useOfficial}>{t("useOfficial", { price: settings.officialReference.price_per_litre, date: day(settings.officialReference.effective_at) })}</button>
            )}
          </div>
        </div>
        {submitFailure && <SetupNotice failure={submitFailure} />}
        <button type="button" className="driver-primary" disabled={busy || request.trim().length < 3} onClick={plan}><Path aria-hidden="true" />{busy ? t("planning") : t("plan")}</button>
        <p className="driver-small">{t("noAiNeeded")}</p>
      </section>

      {current && (
        <section className="tp-card">
          <h2>{t("currentTitle")}</h2>
          <div className="driver-stats">
            <div><span>{t("errands")}</span><strong>{(latest?.stops ?? []).filter((stop) => stop.status === "planned").length}</strong></div>
            <div><span>{t("distance")}</span><strong>{typeof metrics.distanceKm === "number" ? `${metrics.distanceKm.toFixed(1)} km` : "—"}</strong></div>
            <div><span>{t("time")}</span><strong>{typeof metrics.totalMinutes === "number" ? t("minutes", { minutes: Math.round(metrics.totalMinutes) }) : "—"}</strong></div>
            <div><span>{t("fuelCost")}</span><strong>{typeof metrics.fuelCostPkr === "number" ? pkr(metrics.fuelCostPkr) : "—"}</strong></div>
            <div><span>{t("potentialSavings")}</span><strong>{typeof (metrics.comparison as { savingsPkr?: number } | null)?.savingsPkr === "number" ? pkr(Math.max(0, (metrics.comparison as { savingsPkr: number }).savingsPkr)) : "—"}</strong></div>
          </div>
          <p className="driver-small">{t("potentialNote")}</p>
          {metrics.estimateKind === "straight_line" && <p className="driver-small">{t("straightLineNote")}</p>}
          <div className="tp-map"><TrueCostMap center={mapCenter} markers={markers} /></div>
          <Link className="driver-primary tp-back" href={`/app/trips/${current.id}`}>{t("openPlan")}</Link>
        </section>
      )}

      <section className="tp-card">
        <h2>{t("recentTitle")}</h2>
        {trips === null ? <div className="driver-loading" role="status">{t("loading")}</div> : !trips.length ? <p className="driver-empty">{t("noTrips")}</p> : (
          <ul className="tp-list">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link href={`/app/trips/${trip.id}`}>{trip.title ?? t("untitled")}</Link>
                <span className="driver-small">{t(`states.${trip.workflow_state}`)} · {day(trip.updated_at)}{trip.is_demo ? ` · ${t("demo")}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/app/trips/history" className="driver-secondary tp-back">{t("historyLink")}</Link>
      </section>

      <section className="tp-card">
        <h2>{t("savedPlacesTitle")}</h2>
        {places.length ? <p className="driver-small">{places.map((place) => place.label).join(" · ")}</p> : <p className="driver-small">{t("noSavedPlaces")}</p>}
        <Link href="/app/saved-places" className="driver-secondary tp-back">{t("manageSavedPlaces")}</Link>
        <label className="driver-check">
          <input type="checkbox" checked={settings?.preferences?.data_sharing_consent ?? false} onChange={(event) => setConsent(event.target.checked)} />
          {t("consent")}
        </label>
      </section>
    </main>
  );
}
