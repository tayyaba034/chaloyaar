"use client";

import { FormEvent, useState } from "react";
import { useTranslations } from "next-intl";
import { TrueCostMap } from "./truecost-map";

type Result = {
  fuelType: string;
  litres: number;
  directDistanceKm: number;
  kmPerLitre: number | null;
  price: { amount: number; source: string; effectiveAt: string; isDemo: boolean };
  routing: "approximate";
  assumptions: string[];
  stations: Array<{
    id: string;
    name: string;
    address: string | null;
    isDemo: boolean;
    detourKm: number;
    purchaseCost: number;
    detourFuelCost: number | null;
    totalCost: number | null;
    latitude: number;
    longitude: number;
    availability: string;
  }>;
};

export function TrueCostFeature() {
  const t = useTranslations("dashboard.truecost");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  function fillLocation(prefix: "origin" | "destination") {
    if (!navigator.geolocation) {
      setMessage(t("locationUnavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const latitude = document.querySelector<HTMLInputElement>(`[name="${prefix}Latitude"]`);
        const longitude = document.querySelector<HTMLInputElement>(`[name="${prefix}Longitude"]`);
        if (latitude && longitude) {
          latitude.value = coords.latitude.toFixed(6);
          longitude.value = coords.longitude.toFixed(6);
        }
      },
      () => setMessage(t("locationDenied")),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/truecost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    }).catch(() => null);
    setLoading(false);
    if (!response?.ok) {
      const error = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(error?.error?.message ?? t("loadError"));
      return;
    }
    setResult(await response.json() as Result);
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting">
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </section>
      <section className="dashboard-card">
        <form className="dashboard-form" onSubmit={submit}>
          <div className="form-row">
            <label>{t("originLatitude")}<input name="originLatitude" type="number" step="any" required /></label>
            <label>{t("originLongitude")}<input name="originLongitude" type="number" step="any" required /></label>
          </div>
          <button type="button" onClick={() => fillLocation("origin")}>{t("useLocation")}</button>
          <div className="form-row">
            <label>{t("destinationLatitude")}<input name="destinationLatitude" type="number" step="any" required /></label>
            <label>{t("destinationLongitude")}<input name="destinationLongitude" type="number" step="any" required /></label>
          </div>
          <button type="button" onClick={() => fillLocation("destination")}>{t("useDestinationLocation")}</button>
          <label>{t("fuelType")}
            <select name="fuelType" defaultValue="petrol">
              <option value="petrol">{t("fuels.petrol")}</option>
              <option value="diesel">{t("fuels.diesel")}</option>
              <option value="cng">{t("fuels.cng")}</option>
            </select>
          </label>
          <label>{t("litres")}<input name="litres" type="number" min="0.1" max="500" step="0.1" defaultValue="20" required /></label>
          <button type="submit" disabled={loading}>{loading ? t("calculating") : t("calculate")}</button>
        </form>
      </section>
      {message && <p className="inline-alert" role="alert">{message}</p>}
      {result && (
        <>
          <section className="dashboard-card">
            <h2>{t("resultTitle")}</h2>
            <p>{t("price", { amount: result.price.amount.toFixed(2), source: result.price.source })}</p>
            <p>{t("directDistance", { distance: result.directDistanceKm.toFixed(1) })}</p>
            <p>{result.kmPerLitre ? t("efficiency", { value: result.kmPerLitre.toFixed(1) }) : t("missingEfficiency")}</p>
          </section>
          <div className="station-list">
            <TrueCostMap markers={result.stations.map((station) => ({ name: station.name, latitude: station.latitude, longitude: station.longitude, warning: station.availability === "unavailable" ? t("fuelFinished") : undefined }))} />
            {result.stations.map((station) => (
              <section className="dashboard-card" key={station.id}>
                <h2>{station.name}</h2>
                {station.address && <p>{station.address}</p>}
                <p>{t("detour", { distance: station.detourKm.toFixed(1) })}</p>
                {station.availability === "unavailable" && <p className="inline-alert" role="status">{t("fuelFinished")}</p>}
                <p>{t("purchase", { amount: station.purchaseCost.toFixed(2) })}</p>
                {station.totalCost === null ? <p>{t("partialTotal")}</p> : <p><strong>{t("total", { amount: station.totalCost.toFixed(2) })}</strong></p>}
                {station.isDemo && <span className="demo-badge">{t("demo")}</span>}
              </section>
            ))}
          </div>
          <section className="notice-card">
            <h2>{t("assumptionsTitle")}</h2>
            <ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
          </section>
        </>
      )}
    </main>
  );
}
