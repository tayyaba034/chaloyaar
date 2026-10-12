"use client";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crosshair, MagnifyingGlass } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { stationAreas } from "@/lib/station-search";
import { AvailabilityBadge, AvailabilityLegend, type AvailabilityView } from "./availability-badge";
import { PlaceSearch, placeName } from "./place-search";
import { readFailure, SetupNotice, type ApiFailure } from "./setup-notice";
import { TrueCostMap } from "./truecost-map";
import "./trip-planner.css";

export const categories = ["mechanic", "workshop", "clinic", "pharmacy", "office", "shop", "other_service"] as const;
type Business = {
  id: string; name: string; category: string; address: string | null; latitude: number; longitude: number; isDemo: boolean;
  listingStatus: string; publishedHoursText: string | null; distanceKm: number | null; availability: AvailabilityView;
  services: Array<{ id: string; name: string }>;
};
type Origin = { latitude: number; longitude: number; label: string };

export function BusinessSearch() {
  const t = useTranslations("places");
  const stationsT = useTranslations("stations");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [category, setCategory] = useState<string>("");
  const [radius, setRadius] = useState(8);
  const [origin, setOrigin] = useState<Origin>({ ...stationAreas["city-centre"], label: stationsT("areas.city-centre") });
  const [results, setResults] = useState<Business[] | null>(null);
  const [demoShown, setDemoShown] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [gpsMessage, setGpsMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(origin.latitude), lng: String(origin.longitude), radius: String(radius), limit: "30" });
    if (submitted) params.set("q", submitted);
    if (category) params.set("category", category);
    fetch(`/api/businesses?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          setFailure(await readFailure(response));
          setResults([]);
          return;
        }
        const body = await response.json();
        setFailure(null);
        setResults(body.businesses);
        setDemoShown(body.demoShown);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure({ message: t("offline") });
      });
    return () => controller.abort();
  }, [submitted, category, radius, origin, t]);

  const markers = useMemo(() => (results ?? []).map((business) => ({
    name: business.isDemo ? `${business.name} (${t("demo")})` : business.name,
    latitude: business.latitude,
    longitude: business.longitude,
    warning: business.availability.state === "UNAVAILABLE" || business.availability.state === "TEMPORARILY_CLOSED" ? t("notAvailable") : undefined,
  })), [results, t]);
  const radiusRing = useMemo(() => ({ center: origin, km: radius }), [origin, radius]);

  function useGps() {
    if (!navigator.geolocation) return setGpsMessage(t("gpsUnsupported"));
    setGpsMessage(t("gpsLocating"));
    navigator.geolocation.getCurrentPosition(
      (position) => { setOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: t("myLocation") }); setGpsMessage(""); },
      (error) => setGpsMessage(error.code === error.PERMISSION_DENIED ? t("gpsDenied") : t("gpsFailed")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <main className="driver-page tp-page">
      <div className="driver-page-heading">
        <div>
          <h1>{t("title")}</h1>
          <p className="driver-small">{t("subtitle")}</p>
        </div>
      </div>
      <form className="tp-card tp-search" onSubmit={(event) => { event.preventDefault(); setSubmitted(query.trim()); }}>
        <label className="tp-grow">{t("searchLabel")}
          <span className="tp-input-icon"><MagnifyingGlass aria-hidden="true" /><input value={query} maxLength={80} placeholder={t("searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} /></span>
        </label>
        <label>{t("category")}
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">{t("allCategories")}</option>
            {categories.map((value) => <option key={value} value={value}>{t(`categories.${value}`)}</option>)}
          </select>
        </label>
        <label>{t("radius", { km: radius })}
          <input type="range" min={1} max={25} value={radius} onChange={(event) => setRadius(Number(event.target.value))} />
        </label>
        <button type="submit" className="driver-primary">{t("search")}</button>
      </form>
      <div className="tp-card tp-origin">
        <p className="driver-small">{t("near", { place: origin.label })}</p>
        <PlaceSearch label={t("changeLocation")} near={origin} onSelect={(place) => setOrigin({ latitude: place.latitude, longitude: place.longitude, label: placeName(place, locale) })} />
        <button type="button" className="driver-secondary" onClick={useGps}><Crosshair aria-hidden="true" />{t("useGps")}</button>
        {gpsMessage && <span className="driver-small" role="status">{gpsMessage}</span>}
      </div>
      <AvailabilityLegend />
      {demoShown && <p className="driver-message">{t("demoNotice")}</p>}
      {failure && <SetupNotice failure={failure} />}
      {results === null && !failure && <div className="driver-loading" role="status">{t("loading")}</div>}
      {results && (
        <div className="tp-results-layout">
          <ul className="tp-results" aria-label={t("resultsLabel")}>
            {!results.length && !failure && <li className="driver-empty">{t("empty")}</li>}
            {results.map((business) => (
              <li key={business.id} className="tp-result">
                <div className="tp-result-head">
                  <Link href={`/app/places/${business.id}`} className="tp-result-name">{business.name}</Link>
                  {business.isDemo && <span className="tp-demo">{t("demo")}</span>}
                  {business.listingStatus === "unclaimed" && <span className="tp-tag">{t("unclaimed")}</span>}
                </div>
                <p className="driver-small">
                  {t(`categories.${business.category}`)}
                  {business.distanceKm !== null && ` · ${t("distance", { km: business.distanceKm.toFixed(1) })}`}
                  {business.address && ` · ${business.address}`}
                </p>
                <AvailabilityBadge availability={business.availability} />
                {business.services.length > 0 && <p className="driver-small">{business.services.slice(0, 4).map((service) => service.name).join(" · ")}</p>}
                {business.publishedHoursText && <p className="driver-small">{t("publishedHours", { hours: business.publishedHoursText })}</p>}
              </li>
            ))}
          </ul>
          <div className="tp-map">
            <TrueCostMap center={origin} markers={markers} radius={radiusRing} />
            <p className="driver-small">{t("mapNote")}</p>
          </div>
        </div>
      )}
    </main>
  );
}
