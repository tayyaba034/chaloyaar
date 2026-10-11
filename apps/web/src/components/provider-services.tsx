"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

const serviceTypes = ["puncture", "battery", "towing"] as const;

export function ProviderServices() {
  const t = useTranslations("dashboard.providerServices");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState(false);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard/provider/settings", { cache: "no-store" });
      if (!response.ok) throw new Error("Provider settings could not be loaded.");
      const result = await response.json() as { provider: { service_types: string[]; active: boolean; verification_status: string } };
      setSelected(result.provider.service_types);
      setActive(result.provider.active);
      setApproved(result.provider.verification_status === "approved");
    } catch (error) {
      console.error("Provider settings could not be loaded", error);
      setMessage(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/dashboard/provider/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceTypes: selected, active }),
    }).catch(() => null);
    setSaving(false);
    if (!response?.ok) {
      const result = await response?.json().catch(() => null) as { error?: { message?: string } } | null;
      setMessage(result?.error?.message ?? t("saveError"));
      return;
    }
    setMessage(t("saved"));
  }

  return (
    <main className="dashboard-page">
      <section className="dashboard-greeting"><h1>{t("title")}</h1><p>{t("intro")}</p></section>
      {message && <p className="inline-alert" role="status">{message}</p>}
      {loading ? <div className="dashboard-skeleton" aria-busy="true" /> : (
        <section className="dashboard-card">
          {!approved && <p className="inline-alert">{t("pendingNotice")}</p>}
          <fieldset>
            <legend>{t("servicesLabel")}</legend>
            {serviceTypes.map((service) => <label key={service}><input type="checkbox" checked={selected.includes(service)} onChange={(event) => setSelected((current) => event.currentTarget.checked ? [...current, service] : current.filter((item) => item !== service))} />{t(`services.${service}`)}</label>)}
          </fieldset>
          <label><input type="checkbox" checked={active} disabled={!approved} onChange={(event) => setActive(event.currentTarget.checked)} />{t("active")}</label>
          <p className="helper-note">{t("privacy")}</p>
          <button type="button" disabled={saving} onClick={() => void save()}>{saving ? t("saving") : t("save")}</button>
        </section>
      )}
    </main>
  );
}
