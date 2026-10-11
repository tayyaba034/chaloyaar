"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SpeakerButton } from "./speaker-button";

type Overview = {
  newReports: number;
  pendingProviders: number;
  openComplaints: number;
  lastPrice: { effective_at: string; entered_at: string; is_demo: boolean; isOld: boolean } | null;
};

export function AdminDashboard() {
  const t = useTranslations("dashboard.admin");
  const shellT = useTranslations("shell.admin");
  const locale = useLocale();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/dashboard/admin", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Admin overview returned ${response.status}`);
        return (await response.json()) as Overview;
      })
      .then((result) => {
        if (active) {
          setData(result);
          setError(false);
        }
      })
      .catch((loadError: unknown) => {
        console.error("Admin overview could not be loaded", loadError);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const metrics = [
    { label: t("newReports"), value: data?.newReports },
    { label: t("pendingProviders"), value: data?.pendingProviders },
    { label: t("openComplaints"), value: data?.openComplaints },
  ];
  return (
    <main className="dashboard-page admin-dashboard">
      <section className="dashboard-greeting">
        <h1>{shellT("homeTitle")}</h1>
        <SpeakerButton text={shellT("homeTitle")} phraseId="admin-overview-title" />
      </section>
      {error && <p className="inline-alert" role="alert">{t("loadError")}</p>}
      <section className="admin-metrics">
        {metrics.map(({ label, value }) => (
          <article className="dashboard-card admin-metric" key={label}>
            <h2>{label}</h2>
            {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : <p className="dashboard-big-number">{value ?? 0}</p>}
          </article>
        ))}
      </section>
      <section className="dashboard-card">
        <h2>{t("lastFuelPrice")}</h2>
        {loading ? (
          <div className="dashboard-skeleton" aria-busy="true" />
        ) : data?.lastPrice ? (
          <>
            <p>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(data.lastPrice.effective_at))}</p>
            {data.lastPrice.isOld && <p className="inline-alert">{t("oldPrice")}</p>}
          </>
        ) : <p className="empty-state">{t("noPrice")}</p>}
      </section>
    </main>
  );
}
