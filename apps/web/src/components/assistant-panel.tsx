"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChatCircleDots, Lifebuoy, PaperPlaneTilt } from "@phosphor-icons/react";
import { Link } from "@/i18n/navigation";
import "./assistant-panel.css";

type Source = {
  stationId: string;
  name: string;
  distanceKm: number;
  verified: boolean;
  availability: string;
  reportedAt: string | null;
};

type Action = { type: "roadside_help"; serviceType: string; href: string };

export function AssistantPanel({ origin }: { origin?: { latitude: number; longitude: number } | null }) {
  const t = useTranslations("assistant");
  const locale = useLocale();
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [mode, setMode] = useState<"ai" | "basic">("basic");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, locale, ...(origin ? { lat: origin.latitude, lng: origin.longitude } : {}) }),
      });
      const data = await response.json() as { answer?: string; sources?: Source[]; action?: Action | null; mode?: "ai" | "basic"; error?: { message?: string } };
      if (!response.ok) throw new Error(data.error?.message ?? t("error"));
      setAnswer(data.answer ?? "");
      setSources(data.sources ?? []);
      setAction(data.action ?? null);
      setMode(data.mode === "ai" ? "ai" : "basic");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cy-assistant" aria-labelledby="assistant-title">
      <div className="cy-assistant-heading">
        <ChatCircleDots aria-hidden="true" weight="fill" />
        <div>
          <h2 id="assistant-title">{t("title")}</h2>
          <p>{t("subtitle")}</p>
        </div>
      </div>
      <form className="cy-assistant-form" onSubmit={ask}>
        <label htmlFor="assistant-message">{t("label")}</label>
        <div>
          <input id="assistant-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("placeholder")} maxLength={500} />
          <button type="submit" disabled={busy || !message.trim()} aria-label={t("send")}>
            <PaperPlaneTilt aria-hidden="true" weight="fill" />
            <span>{busy ? t("thinking") : t("send")}</span>
          </button>
        </div>
      </form>
      {error && <p className="cy-station-alert" role="alert">{error}</p>}
      {answer && (
        <div className="cy-assistant-answer" role="status">
          <p>{answer}</p>
          <p className="driver-small">{t("grounded")}</p>
          {mode === "ai" && <p className="driver-small">{t("aiNotice")}</p>}
          {sources.length > 0 && (
            <ul>
              {sources.slice(0, 3).map((source) => (
                <li key={source.stationId}>{source.name} · {source.distanceKm.toFixed(1)} km · {source.availability}</li>
              ))}
            </ul>
          )}
          {action && (
            <div className="cy-assistant-action">
              <Link href={action.href} className="driver-secondary">
                <Lifebuoy aria-hidden="true" weight="fill" />
                {t("helpAction")}
              </Link>
              <p className="driver-small">{t("helpNote")}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
