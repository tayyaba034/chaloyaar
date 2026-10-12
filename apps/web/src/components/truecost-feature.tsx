"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight, MapPin, NavigationArrow } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import { TrueCostMap } from "./truecost-map";
import { useDriverResource } from "./use-driver-resource";
import type { DriverVehicle } from "@/lib/driver-records";
import { calculateEstimate, type Point } from "@/lib/truecost";
import { stationAreas } from "@/lib/station-search";
import type { RouteComparison } from "@/lib/route-comparison";

type Result = RouteComparison & { fuelType: string; litres: number; kmPerLitre: number | null; calculatedAt: string };
const areas = Object.keys(stationAreas) as Array<keyof typeof stationAreas>;
const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "");

export function TrueCostFeature() {
  const t = useTranslations("routeComparison");
  const areaT = useTranslations("stations.areas");
  const locale = useLocale();
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState("");
  const [area, setArea] = useState<keyof typeof stationAreas>("city-centre");
  const [gps, setGps] = useState<Point | null>(null);
  const [destinationMode, setDestinationMode] = useState("landmark");
  const [destinationText, setDestinationText] = useState("");
  const vehicles = useDriverResource<{ vehicles: DriverVehicle[] }>("/api/driver/vehicles");
  const [vehicleId, setVehicleId] = useState("");
  const [fuel, setFuel] = useState("petrol");
  const [selected, setSelected] = useState("");
  const [personal, setPersonal] = useState<ReturnType<typeof calculateEstimate> | null>(null);
  const savedVehicle = vehicles.data?.vehicles.find(vehicle => vehicle.id === vehicleId);
  // Stable map props so the map only refits when the result or selection changes.
  const mapView = useMemo(() => {
    if (result?.status !== "ready" || !result.direct) return null;
    const start = result.direct.geometry?.coordinates[0];
    return {
      center: start ? { latitude: start[1], longitude: start[0] } : undefined,
      routeGeometry: result.stations.find(station => station.id === selected)?.geometry ?? result.direct.geometry,
      markers: result.stations.map(station => ({ name: station.name, latitude: station.latitude, longitude: station.longitude, address: station.address })),
    };
  }, [result, selected]);
  const money = (value: number | null) => value === null ? t("unknown") : `PKR ${value.toFixed(2)}`;
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(value));

  useEffect(() => {
    if (!result) return;
    const deadlines = result.stations.flatMap(station => station.price ? [Date.parse(station.price.expiresAt)] : []);
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => { setResult(null); setMessage(t("priceExpired")); }, Math.min(2147483647, Math.max(0, Math.min(...deadlines) - Date.now())));
    return () => window.clearTimeout(timer);
  }, [result, t]);

  function useLocation() {
    if (!navigator.geolocation) { setMessage(t("locationDenied")); return; }
    setLocating(true);
    setResult(null);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setGps({ latitude: coords.latitude, longitude: coords.longitude });
      setLocating(false); setMessage("");
    }, () => { setLocating(false); setMessage(t("locationDenied")); }, { timeout: 10000, maximumAge: 60000 });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const destinationArea = areas.find(id => normalise(id) === normalise(destinationText) || normalise(areaT(id)) === normalise(destinationText));
    if (destinationMode === "landmark" && !destinationArea) { setResult(null); setMessage(t("destinationHint")); return; }
    const origin = gps ?? stationAreas[area];
    const destination = destinationMode === "landmark" ? stationAreas[destinationArea!] : { latitude: form.get("destinationLatitude"), longitude: form.get("destinationLongitude") };
    setLoading(true); setMessage(""); setResult(null); setSelected("");
    try {
      const response = await fetch("/api/truecost", {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ ...Object.fromEntries(form.entries()), originLatitude: origin.latitude, originLongitude: origin.longitude, destinationLatitude: destination.latitude, destinationLongitude: destination.longitude }),
        signal: AbortSignal.timeout(90000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? t("loadError"));
      setResult(data as Result);
    } catch (error) { setMessage(error instanceof Error ? error.message : t("loadError")); }
    finally { setLoading(false); }
  }

  return (
    <main className="dashboard-page route-comparison-page">
      <section className="dashboard-greeting"><h1>{t("title")}</h1><p>{t("subtitle")}</p></section>
      <form className="dashboard-form" onSubmit={submit} onChange={() => { setResult(null); setMessage(""); }}>
        <fieldset disabled={loading || locating}>
          <div className="driver-form-grid">
            <label className="driver-field">{t("startingArea")}<select value={gps ? "gps" : area} onChange={event => { if (event.target.value === "gps") return; setGps(null); setArea(event.target.value as keyof typeof stationAreas); }}>
              {gps && <option value="gps">{t("currentLocation")}</option>}
              {areas.map(id => <option value={id} key={id}>{areaT(id)}</option>)}
            </select></label>
            <div className="driver-field"><span>{t("locationOptional")}</span><button type="button" className="driver-secondary" onClick={useLocation}><NavigationArrow />{locating ? t("locating") : t("useLocation")}</button></div>
          </div>
          <div className="driver-actions" role="group" aria-label={t("destinationMode")}>
            <button type="button" className="driver-secondary" aria-pressed={destinationMode === "landmark"} onClick={() => { setDestinationMode("landmark"); setResult(null); }}><MapPin />{t("landmark")}</button>
            <button type="button" className="driver-secondary" aria-pressed={destinationMode === "coordinates"} onClick={() => { setDestinationMode("coordinates"); setResult(null); }}><MapPin />{t("coordinates")}</button>
          </div>
          {destinationMode === "landmark" ? <label className="driver-field">{t("destination")}<input value={destinationText} onChange={event => setDestinationText(event.target.value)} list="truecost-destinations" required /><datalist id="truecost-destinations">{areas.map(id => <option key={id} value={areaT(id)} />)}</datalist></label> : <div className="driver-form-grid">
            <label className="driver-field">{t("latitude")}<input name="destinationLatitude" type="number" min="-90" max="90" step="any" required /></label>
            <label className="driver-field">{t("longitude")}<input name="destinationLongitude" type="number" min="-180" max="180" step="any" required /></label>
          </div>}
          <p className="driver-small">{t("destinationHint")}</p>
          <div className="driver-form-grid">
            <label className="driver-field">{t("vehicle")}<select name="vehicleId" value={vehicleId} onChange={event => { setVehicleId(event.target.value); const vehicle = vehicles.data?.vehicles.find(item => item.id === event.target.value); if (vehicle) setFuel(vehicle.fuel_type); }}><option value="">{t("manualEconomy")}</option>{vehicles.data?.vehicles.filter(vehicle => vehicle.fuel_type !== "cng").map(vehicle => <option value={vehicle.id} key={vehicle.id}>{vehicle.nickname}</option>)}</select></label>
            <label className="driver-field">{t("economy")}<input name="kmPerLitre" type="number" min="0.1" max="200" step="any" disabled={savedVehicle?.estimated_km_per_litre != null} placeholder={savedVehicle?.estimated_km_per_litre != null ? String(savedVehicle.estimated_km_per_litre) : ""} /></label>
            <label className="driver-field">{t("fuel")}<select name="fuelType" value={fuel} onChange={event => { setFuel(event.target.value); setVehicleId(""); }}><option value="petrol">{t("petrol")}</option><option value="diesel">{t("diesel")}</option></select></label>
            <label className="driver-field">{t("quantity")}<input name="litres" type="number" min="0.1" max="500" step="any" required /></label>
          </div>
          <p className="driver-small">{t("economyHint")}</p><p className="driver-small">{t("privacy")}</p>
          <button className="driver-primary" type="submit" disabled={loading || locating}>{loading ? t("loading") : t("compare")}</button>
        </fieldset>
      </form>
      {vehicles.error && <p role="status">{t("vehicleError")} <button className="driver-secondary" type="button" onClick={vehicles.refresh}>{t("retry")}</button></p>}
      {message && <p className="driver-message" role="alert">{message}</p>}
      {result && <section className="driver-section" aria-live="polite">
        <h2>{t("results")}</h2>
        {result.status === "route_unavailable" ? <><p role="status">{t("routeUnavailable")}</p><Link className="driver-secondary" href="/app/stations">{t("nearbyFallback")}<ArrowUpRight /></Link></> : <>
          <p>{t("direct")}: {result.direct!.distanceKm.toFixed(2)} km · {result.direct!.source}</p>
          <p>{t("quantity")}: {result.litres} L · {t("economy")}: {result.kmPerLitre ?? t("unknown")}</p>
          <p>{t("calculatedAt")}: {date(result.calculatedAt)}</p>
          <p>{t("coverage")}</p><p>{t(result.ranking === "estimated_total" ? "rankedTotal" : "rankedDistance")}</p>
          {mapView && <TrueCostMap center={mapView.center} routeGeometry={mapView.routeGeometry} markers={mapView.markers} />}
          {!result.stations.length && <p role="status">{t("noStations")}</p>}
          {result.stations.map(station => <article className="driver-section" key={station.id}>
            <div className="driver-page-heading"><h3>{station.name}</h3><button type="button" className="driver-secondary" aria-pressed={selected === station.id} onClick={() => setSelected(station.id)}><MapPin />{selected === station.id ? t("selected") : t("select")}</button></div>
            {station.address && <p>{station.address}</p>}
            {station.routeAvailable ? <p>{t("direct")}: {station.directDistanceKm.toFixed(2)} km · {t("via")}: {station.viaStationDistanceKm!.toFixed(2)} km · {t("added")}: {station.detourKm!.toFixed(2)} km</p> : <p>{t("viaUnavailable")}</p>}
            <dl className="route-cost-breakdown"><div><dt>{t("purchase")}</dt><dd>{money(station.purchaseCost)}</dd></div><div><dt>{t("detourFuel")}</dt><dd>{money(station.detourFuelCost)}</dd></div><div><dt>{t("discount")}</dt><dd>{money(station.discount)}</dd></div><div><dt>{t("total")}</dt><dd>{money(station.totalCost)}</dd></div></dl>
            {station.price ? <p className="driver-small">{station.price.stationId ? t("stationPrice") : t("referencePrice")}: {money(station.price.amount)}/L · {station.price.source} · {t("effective")}: {date(station.price.effectiveAt)} · {t("expiry")}: {date(station.price.expiresAt)} · {t("reviewed")}: {date(station.price.verifiedAt)}{station.price.sourceUrl && /^https?:\/\//i.test(station.price.sourceUrl) && <> · <a href={station.price.sourceUrl} target="_blank" rel="noreferrer">{t("source")}</a></>}</p> : <p>{t("missingPrice")}</p>}
            <ul className="driver-small">{station.explanations.map(reason => <li key={reason}>{t(`reasons.${reason}`)}</li>)}</ul>
            <div className="driver-actions"><Link className="driver-secondary" href={`/app/stations/${station.id}?fuelType=${result.fuelType}`}>{t("details")}<ArrowUpRight /></Link><a className="driver-secondary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}&travelmode=driving`}>{t("directions")}<ArrowUpRight /></a></div>
          </article>)}
        </>}
        <p className="driver-small">{t("disclaimer")}</p>
      </section>}
      <section className="driver-section"><h2>{t("personalTitle")}</h2><p>{t("personalHint")}</p><form className="dashboard-form" onChange={() => setPersonal(null)} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); setPersonal(calculateEstimate({ directDistanceKm: 0, viaStationDistanceKm: Number(form.get("extraKm")), litres: Number(form.get("quantity")), pricePerLitre: Number(form.get("price")), kmPerLitre: Number(form.get("economy")) })); }}>
        <div className="driver-form-grid"><label className="driver-field">{t("quantity")}<input name="quantity" type="number" min="0.1" max="500" step="any" required /></label><label className="driver-field">{t("assumedPrice")}<input name="price" type="number" min="0.01" max="10000" step="any" required /></label><label className="driver-field">{t("assumedExtra")}<input name="extraKm" type="number" min="0" max="150" step="any" required /></label><label className="driver-field">{t("economy")}<input name="economy" type="number" min="0.1" max="200" step="any" required /></label></div><button className="driver-secondary" type="submit">{t("personalCalculate")}</button>
      </form>{personal && <p role="status">{t("personalTitle")}: {money(personal.purchaseCost)} + {money(personal.detourFuelCost)} - PKR 0 = {money(personal.totalCost)}</p>}</section>
    </main>
  );
}
