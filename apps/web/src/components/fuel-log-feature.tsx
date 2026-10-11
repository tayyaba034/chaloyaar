"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type FuelLog = {
  id: string;
  litres: number;
  total_amount: number;
  odometer_km: number | null;
  logged_at: string;
  stations: { name: string } | null;
};

type Summary = { totalLitres: number; totalSpend: number; kmPerLitre: number | null };

export function FuelLogFeature({ formOnly = false }: { formOnly?: boolean }) {
  const t = useTranslations("dashboard.fuelLog");
  const [logs, setLogs] = useState<FuelLog[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(!formOnly);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (formOnly) return;
    void fetch("/api/fuel-logs", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Fuel logs could not be loaded.");
        return response.json() as Promise<{ logs: FuelLog[]; summary: Summary }>;
      })
      .then((result) => {
        setLogs(result.logs);
        setSummary(result.summary);
      })
      .catch((error: unknown) => {
        console.error("Fuel logs could not be loaded", error);
        setMessage(t("loadError"));
      })
      .finally(() => setLoading(false));
  }, [formOnly, t]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setSuccess(false);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/fuel-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        litres: form.get("litres"),
        totalAmount: form.get("totalAmount"),
        odometer: form.get("odometer"),
        loggedAt: form.get("loggedAt"),
        stationId: form.get("stationId") || null,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(result?.error?.message ?? t("saveError"));
      return;
    }
    event.currentTarget.reset();
    setSuccess(true);
    if (!formOnly) {
      const result = await fetch("/api/fuel-logs", { cache: "no-store" }).then((item) => item.json()) as { logs: FuelLog[]; summary: Summary };
      setLogs(result.logs);
      setSummary(result.summary);
    }
  }

  const form = (
    <form className="dashboard-form" onSubmit={submit}>
      <label>{t("litres")}<input name="litres" type="number" min="0.001" max="500" step="0.001" required /></label>
      <label>{t("totalAmount")}<input name="totalAmount" type="number" min="0" max="1000000" step="0.01" required /></label>
      <label>{t("odometer")}<input name="odometer" type="number" min="0" max="2000000" step="0.1" /></label>
      <label>{t("date")}<input name="loggedAt" type="datetime-local" defaultValue={new Date().toISOString().slice(0, 16)} required /></label>
      <button type="submit" disabled={saving}>{saving ? t("saving") : t("save")}</button>
    </form>
  );

  if (formOnly) {
    return <main className="feature-placeholder"><section className="notice-card"><h1>{t("addTitle")}</h1>{message && <p className="inline-alert" role="alert">{message}</p>}{success && <p role="status">{t("saved")}</p>}{form}</section></main>;
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting"><h1>{t("title")}</h1><Link href="/app/vehicle/log">{t("addLog")}</Link></section>
      {message && <p className="inline-alert" role="alert">{message}</p>}
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : (
        <>
          <section className="dashboard-card">
            <h2>{t("summaryTitle")}</h2>
            <p>{t("totalSpend", { amount: summary?.totalSpend.toFixed(2) ?? "0.00" })}</p>
            <p>{t("totalLitres", { litres: summary?.totalLitres.toFixed(2) ?? "0.00" })}</p>
            <p>{summary?.kmPerLitre ? t("efficiency", { value: summary.kmPerLitre.toFixed(1) }) : t("notEnoughData")}</p>
          </section>
          {logs.length ? <div className="station-list">{logs.map((log) => <section className="dashboard-card" key={log.id}><h2>{log.stations?.name ?? t("unknownStation")}</h2><p>{t("logLine", { litres: Number(log.litres).toFixed(2), amount: Number(log.total_amount).toFixed(2) })}</p><p>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(log.logged_at))}</p></section>)}</div> : <section className="notice-card"><h2>{t("emptyTitle")}</h2><p>{t("emptyMessage")}</p></section>}
        </>
      )}
    </main>
  );
}
