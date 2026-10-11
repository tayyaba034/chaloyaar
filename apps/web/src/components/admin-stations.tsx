"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Station = {
  id: string;
  name: string;
  brand: string | null;
  address: string | null;
  supported_fuels: string[];
  verification_status: string;
  is_demo: boolean;
  source: string;
  source_url: string | null;
  latitude: number | string;
  longitude: number | string;
  verified_at: string | null;
};
const fuels = ["petrol", "diesel", "cng"] as const;
const statuses = ["unverified", "pending", "verified", "rejected"] as const;

export function AdminStations() {
  const t = useTranslations("dashboard.adminStations");
  const detailsT = useTranslations("stations.discovery");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/stations", { cache: "no-store" });
      if (!response.ok) throw new Error("Stations could not be loaded.");
      setStations((await response.json() as { stations: Station[] }).stations);
    } catch (error) {
      console.error("Admin stations could not be loaded", error);
      setMessage(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save(station: Station) {
    setBusy(station.id);
    setMessage("");
    const response = await fetch("/api/admin/stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stationId: station.id,
        name: station.name,
        brand: station.brand ?? "",
        address: station.address ?? "",
        supportedFuels: station.supported_fuels,
        verificationStatus: station.verification_status,
        latitude: station.latitude,
        longitude: station.longitude,
        source: station.source,
        sourceUrl: station.source_url ?? "",
        detailsChecked: checked[station.id] === true,
      }),
    }).catch(() => null);
    setBusy("");
    if (!response?.ok) {
      setMessage(t("updateError"));
      return;
    }
    setMessage(t("updated"));
    setChecked((current) => ({ ...current, [station.id]: false }));
    await load();
  }

  function update(id: string, field: keyof Station, value: string | string[]) {
    setChecked((current) => ({ ...current, [id]: false }));
    setStations((current) => current.map((station) => station.id === id ? { ...station, [field]: value } : station));
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting"><p className="eyebrow">{t("verificationEyebrow")}</p><h1>{t("verificationTitle")}</h1><p>{t("verificationIntro")}</p></section>
      {message && <p className="inline-alert" role="status">{message}</p>}
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : <div className="station-list">
        {stations.map((station) => (
          <section className="dashboard-card" key={station.id}>
            <h2>{station.name}</h2>
            {station.is_demo && <span className="demo-badge">{t("demo")}</span>}
            <label>{t("name")}<input value={station.name} onChange={(event) => update(station.id, "name", event.currentTarget.value)} /></label>
            <label>{t("brand")}<input value={station.brand ?? ""} onChange={(event) => update(station.id, "brand", event.currentTarget.value)} /></label>
            <label>{t("address")}<input value={station.address ?? ""} onChange={(event) => update(station.id, "address", event.currentTarget.value)} /></label>
            <fieldset><legend>{t("fuelsLabel")}</legend>{fuels.map((fuel) => <label key={fuel}><input type="checkbox" checked={station.supported_fuels.includes(fuel)} onChange={(event) => update(station.id, "supported_fuels", event.currentTarget.checked ? [...station.supported_fuels, fuel] : station.supported_fuels.filter((item) => item !== fuel))} />{t(`fuels.${fuel}`)}</label>)}</fieldset>
            <label>{t("status")}<select value={station.verification_status} onChange={(event) => update(station.id, "verification_status", event.currentTarget.value)}>{statuses.map((status) => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}</select></label>
            <label>{detailsT("latitude")}<input type="number" min="-90" max="90" step="any" value={station.latitude} onChange={(event) => update(station.id, "latitude", event.currentTarget.value)} /></label>
            <label>{detailsT("longitude")}<input type="number" min="-180" max="180" step="any" value={station.longitude} onChange={(event) => update(station.id, "longitude", event.currentTarget.value)} /></label>
            <label>{t("source")}<input maxLength={200} value={station.source} onChange={(event) => update(station.id, "source", event.currentTarget.value)} /></label>
            <label>{detailsT("sourceUrl")}<input type="url" maxLength={2000} value={station.source_url ?? ""} onChange={(event) => update(station.id, "source_url", event.currentTarget.value)} /></label>
            <p>{detailsT("lastVerified")}: {station.verified_at ? new Date(station.verified_at).toLocaleString() : detailsT("notVerified")}</p>
            {station.verification_status === "verified" && <label><input type="checkbox" checked={checked[station.id] === true} onChange={(event) => { const isChecked = event.currentTarget.checked; setChecked((current) => ({ ...current, [station.id]: isChecked })); }} />{detailsT("checked")}</label>}
            <button type="button" disabled={busy === station.id || (station.verification_status === "verified" && !checked[station.id])} onClick={() => void save(station)}>{busy === station.id ? t("saving") : t("save")}</button>
          </section>
        ))}
      </div>}
    </main>
  );
}
