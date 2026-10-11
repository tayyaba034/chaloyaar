"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Report = {
  id: string;
  fuel_type: string;
  reported_status: string;
  reported_at: string;
  is_demo: boolean;
  stations: { name: string; address: string | null };
};

export function StationReportModeration() {
  const t = useTranslations("dashboard.reportModeration");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/station-reports", { cache: "no-store" });
      if (!response.ok) throw new Error("Reports could not be loaded.");
      const result = (await response.json()) as { reports: Report[] };
      setReports(result.reports);
    } catch (error) {
      console.error("Station reports could not be loaded", error);
      setMessage(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function moderate(reportId: string, status: "approved" | "rejected") {
    setBusy(reportId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/station-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, status }),
      });
      if (!response.ok) throw new Error("Moderation failed.");
      setReports((current) => current.filter((report) => report.id !== reportId));
    } catch (error) {
      console.error("Station report moderation failed", error);
      setMessage(t("actionError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting"><h1>{t("title")}</h1></section>
      {message && <p className="inline-alert" role="alert">{message}</p>}
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : reports.length ? (
        <div className="station-list">
          {reports.map((report) => (
            <section className="dashboard-card" key={report.id}>
              <h2>{report.stations.name}</h2>
              {report.stations.address && <p>{report.stations.address}</p>}
              <p>{t("reportLine", { fuel: t(`fuels.${report.fuel_type}`), status: t(`statuses.${report.reported_status}`) })}</p>
              <p>{t("reportedAt", { date: new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(report.reported_at)) })}</p>
              {report.is_demo && <span className="demo-badge">{t("demo")}</span>}
              <div className="provider-request-actions">
                <button type="button" disabled={busy === report.id} onClick={() => void moderate(report.id, "approved")}>{t("approve")}</button>
                <button type="button" disabled={busy === report.id} onClick={() => void moderate(report.id, "rejected")}>{t("reject")}</button>
              </div>
            </section>
          ))}
        </div>
      ) : <section className="notice-card"><h2>{t("emptyTitle")}</h2><p>{t("emptyMessage")}</p></section>}
    </main>
  );
}
