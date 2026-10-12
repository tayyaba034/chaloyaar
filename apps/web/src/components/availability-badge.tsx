"use client";
import { useTranslations } from "next-intl";
import { availabilityStates, riskLevel, type AvailabilityState } from "@/lib/availability-machine";
import "./availability.css";

export type AvailabilityView = { state: AvailabilityState; source: string | null; submittedAt: string | null; until: string | null; explanation?: string | null };

const clock = (iso: string) => new Date(iso).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });

function minutesAgo(iso: string) {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
}

// One badge everywhere availability is shown: state, who said so, when, and until when.
export function AvailabilityBadge({ availability, compact = false }: { availability: AvailabilityView; compact?: boolean }) {
  const t = useTranslations("availability");
  const risk = riskLevel(availability.state);
  return (
    <div className={`availability availability--${risk}`}>
      <span className="availability-state">{t(`states.${availability.state}.label`)}</span>
      {!compact && (
        <span className="availability-meta">
          {availability.source && `${t(`sources.${availability.source}`)} · `}
          {availability.submittedAt && t("updatedAgo", { minutes: minutesAgo(availability.submittedAt) })}
          {availability.until && ` · ${t(availability.state === "EXPIRED" ? "expiredAt" : "validUntil", { time: clock(availability.until) })}`}
          {!availability.submittedAt && t(`states.${availability.state}.meaning`)}
        </span>
      )}
    </div>
  );
}

// The state machine, explained in plain words (visible on search and business pages).
export function AvailabilityLegend() {
  const t = useTranslations("availability");
  return (
    <details className="availability-legend">
      <summary>{t("legendTitle")}</summary>
      <ul>
        {availabilityStates.map((state) => (
          <li key={state}>
            <span className={`availability availability--${riskLevel(state)}`}><span className="availability-state">{t(`states.${state}.label`)}</span></span>
            <span>{t(`states.${state}.meaning`)}</span>
          </li>
        ))}
      </ul>
      <p className="driver-small">{t("legendNote")}</p>
    </details>
  );
}
