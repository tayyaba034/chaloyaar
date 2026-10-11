"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type FuelPrice = {
  id: string;
  fuel_type: string;
  price_per_litre: number;
  source_name: string;
  source_url: string | null;
  effective_at: string;
  entered_at: string;
  is_demo: boolean;
  expires_at: string | null;
  station_id: string | null;
};

export function AdminFuelPrices() {
  const t = useTranslations("dashboard.adminFuelPrices");
  const routeT = useTranslations("routeComparison");
  const [stations, setStations] = useState<Array<{id:string;name:string;verification_status:string;is_demo:boolean}>>([]);
  const [prices, setPrices] = useState<FuelPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/fuel-prices", { cache: "no-store" });
      if (!response.ok) throw new Error("Fuel prices could not be loaded.");
      const result = await response.json() as { prices: FuelPrice[] };
      setPrices(result.prices);
      const stationResponse = await fetch("/api/admin/stations", { cache: "no-store" });
      if (stationResponse.ok) setStations((await stationResponse.json()).stations);
    } catch (error) {
      console.error("Admin fuel prices could not be loaded", error);
      setMessage(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    for (const field of ["effectiveAt", "expiresAt"]) form.set(field, new Date(String(form.get(field))).toISOString());
    const response = await fetch("/api/admin/fuel-prices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(result?.error?.message ?? t("saveError"));
      return;
    }
    formElement.reset();
    setMessage(t("saved"));
    await load();
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </section>
      {message && <p className="inline-alert" role="status">{message}</p>}
      <section className="dashboard-card">
        <h2>{t("formTitle")}</h2>
        <form className="dashboard-form" onSubmit={submit}>
          <label>{t("fuelType")}
            <select name="fuelType" defaultValue="petrol">
              <option value="petrol">{t("fuels.petrol")}</option>
              <option value="diesel">{t("fuels.diesel")}</option>
              <option value="cng">{t("fuels.cng")}</option>
            </select>
          </label>
          <label>{t("price")}<input name="pricePerLitre" type="number" min="0.01" max="10000" step="0.01" required /></label>
          <label>{t("source")}<input name="sourceName" maxLength={200} required /></label>
          <label>{t("sourceUrl")}<input name="sourceUrl" type="url" placeholder="https://..." /></label>
          <label>{t("effectiveAt")}<input name="effectiveAt" type="datetime-local" required /></label>
          <label>{routeT("priceExpiry")}<input name="expiresAt" type="datetime-local" required /></label>
          <label>{routeT("priceScope")}<select name="stationId"><option value="">{routeT("referenceScope")}</option>{stations.filter(station => station.verification_status === "verified" && !station.is_demo).map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
          <label><input name="priceChecked" type="checkbox" required />{routeT("priceChecked")}</label>
          <button type="submit" disabled={saving}>{saving ? t("saving") : t("save")}</button>
        </form>
      </section>
      <section>
        <h2>{t("historyTitle")}</h2>
        {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : prices.length ? (
          <div className="station-list">
            {prices.map((price) => (
              <article className="dashboard-card" key={price.id}>
                <h3>{t(`fuels.${price.fuel_type}`)} — {Number(price.price_per_litre).toFixed(2)}</h3>
                <p>{price.source_name}</p>
                <p>{price.station_id ? routeT("stationPrice") : routeT("referencePrice")}</p>
                <p>{routeT("expiry")}: {price.expires_at ? new Date(price.expires_at).toLocaleString() : routeT("unknown")}</p>
                <p>{t("effective", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(price.effective_at)) })}</p>
                {price.source_url && <a href={price.source_url} target="_blank" rel="noreferrer">{t("viewSource")}</a>}
                {price.is_demo && <span className="demo-badge">{t("demo")}</span>}
              </article>
            ))}
          </div>
        ) : <section className="notice-card"><h3>{t("emptyTitle")}</h3><p>{t("emptyMessage")}</p></section>}
      </section>
    </main>
  );
}
