"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { FuelType, Station } from "@/lib/station-data";

type ReportStatus = "available" | "unavailable" | "queue_reported";

export function StationReportForm({ station }: { station: Station }) {
  const t = useTranslations("dashboard.stationReport");
  const [fuelType, setFuelType] = useState<FuelType>(station.supportedFuels[0] ?? "petrol");
  const [status, setStatus] = useState<ReportStatus>("available");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/station-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationId: station.id, fuelType, status }),
      });
      if (!response.ok) throw new Error("Report submission failed.");
      setMessage(t("success"));
    } catch (error) {
      console.error("Station report submission failed", error);
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-page">
      <Link className="back-link" href={`/app/stations/${station.id}`}>← {t("back")}</Link>
      <section className="dashboard-card" aria-labelledby="station-report-title">
        <h1 id="station-report-title">{t("title")}</h1>
        <p>{station.name}</p>
        <label className="cy-field">
          <span>{t("fuelLabel")}</span>
          <select value={fuelType} onChange={(event) => setFuelType(event.currentTarget.value as FuelType)}>
            {station.supportedFuels.map((fuel) => <option key={fuel} value={fuel}>{t(`fuels.${fuel}`)}</option>)}
          </select>
        </label>
        <fieldset className="cy-field">
          <legend>{t("statusLabel")}</legend>
          {(["available", "unavailable", "queue_reported"] as ReportStatus[]).map((value) => (
            <label key={value}>
              <input type="radio" name="station-status" value={value} checked={status === value} onChange={() => setStatus(value)} />
              {t(`statuses.${value}`)}
            </label>
          ))}
        </fieldset>
        {message && <p className="inline-alert" role="status">{message}</p>}
        <button type="button" className="cy-button cy-button--accent" disabled={busy} onClick={() => void submit()}>
          {busy ? t("working") : t("submit")}
        </button>
      </section>
    </main>
  );
}
