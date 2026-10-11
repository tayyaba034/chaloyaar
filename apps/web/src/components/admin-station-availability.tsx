"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Station = { id: string; name: string; address: string | null; supported_fuels: string[]; is_demo: boolean };
type Service = { station_id: string; service_type: string; status: "available" | "unavailable"; updated_at: string };
type ServicePrice = { service_type: string; price_pkr: number; source_name: string };
const serviceTypes = ["petrol", "diesel", "cng", "tyre_repair", "battery_help", "towing", "portable_diesel_delivery"] as const;

export function AdminStationAvailability() {
  const t = useTranslations("dashboard.adminStations");
  const [stations, setStations] = useState<Station[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [prices, setPrices] = useState<ServicePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const [availabilityResponse, pricesResponse] = await Promise.all([
        fetch("/api/admin/station-availability", { cache: "no-store" }),
        fetch("/api/admin/service-prices", { cache: "no-store" }),
      ]);
      if (!availabilityResponse.ok || !pricesResponse.ok) throw new Error("Station availability could not be loaded.");
      const result = await availabilityResponse.json() as { stations: Station[]; services: Service[] };
      const priceResult = await pricesResponse.json() as { prices: ServicePrice[] };
      setStations(result.stations);
      setServices(result.services);
      setPrices(priceResult.prices);
    } catch (error) {
      console.error("Admin station availability could not be loaded", error);
      setMessage(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function update(stationId: string, serviceType: string, status: "available" | "unavailable") {
    const key = `${stationId}:${serviceType}`;
    setBusy(key);
    setMessage("");
    const response = await fetch("/api/admin/station-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stationId, serviceType, status }),
    }).catch(() => null);
    setBusy("");
    if (!response?.ok) {
      setMessage(t("updateError"));
      return;
    }
    const result = await response.json() as { service: Service };
    setServices((current) => [...current.filter((item) => !(item.station_id === stationId && item.service_type === serviceType)), result.service]);
    setMessage(t("updated"));
  }

  function current(stationId: string, serviceType: string) {
    return services.find((item) => item.station_id === stationId && item.service_type === serviceType)?.status;
  }

  async function updatePrice(serviceType: string, form: HTMLFormElement) {
    const data = new FormData(form);
    const response = await fetch("/api/admin/service-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceType, pricePkr: data.get("pricePkr"), sourceName: data.get("sourceName") }),
    }).catch(() => null);
    if (!response?.ok) {
      setMessage(t("priceUpdateError"));
      return;
    }
    const result = await response.json() as { price: ServicePrice };
    setPrices((currentPrices) => [...currentPrices.filter((price) => price.service_type !== serviceType), result.price]);
    setMessage(t("priceUpdated"));
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting"><p className="eyebrow">{t("eyebrow")}</p><h1>{t("title")}</h1><p>{t("intro")}</p></section>
      {message && <p className="inline-alert" role="status">{message}</p>}
      <section className="dashboard-card">
        <h2>{t("pricingTitle")}</h2>
        <p>{t("pricingIntro")}</p>
        <div className="station-list">
          {serviceTypes.slice(3).map((serviceType) => {
            const price = prices.find((item) => item.service_type === serviceType);
            return <form className="dashboard-form" key={serviceType} onSubmit={(event) => { event.preventDefault(); void updatePrice(serviceType, event.currentTarget); }}>
              <h3>{t(`services.${serviceType}`)}</h3>
              <label>{t("pricePkr")}<input name="pricePkr" type="number" min="0" step="0.01" defaultValue={price?.price_pkr ?? ""} required /></label>
              <label>{t("source")}<input name="sourceName" defaultValue={price?.source_name ?? ""} required /></label>
              <button type="submit">{t("savePrice")}</button>
            </form>;
          })}
        </div>
      </section>
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : <div className="station-list">
        {stations.map((station) => (
          <section className="dashboard-card" key={station.id}>
            <h2>{station.name}</h2>
            {station.address && <p>{station.address}</p>}
            {station.is_demo && <span className="demo-badge">{t("demo")}</span>}
            <div className="provider-request-actions">
              {serviceTypes.map((serviceType) => {
                if (["petrol", "diesel", "cng"].includes(serviceType) && !station.supported_fuels.includes(serviceType)) return null;
                const status = current(station.id, serviceType);
                const key = `${station.id}:${serviceType}`;
                return <div key={serviceType}><strong>{t(`services.${serviceType}`)}</strong><span>{status ? t(`statuses.${status}`) : t("notSet")}</span><button type="button" disabled={busy === key} onClick={() => void update(station.id, serviceType, "available")}>{t("available")}</button><button type="button" disabled={busy === key} onClick={() => void update(station.id, serviceType, "unavailable")}>{t("unavailable")}</button></div>;
              })}
            </div>
          </section>
        ))}
      </div>}
    </main>
  );
}
