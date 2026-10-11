"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SpeakerButton } from "./speaker-button";

const actions = [
  { key: "fuel", icon: "⛽", href: "/dashboard/stations" },
  { key: "savings", icon: "🪙", href: "/dashboard/coming/savings" },
  { key: "help", icon: "🧰", href: "/dashboard/coming/help" },
  { key: "car", icon: "🚗", href: "/dashboard/coming/car" },
] as const;

export function DashboardExperience() {
  const t = useTranslations("home");
  const landing = useTranslations("landing");

  return (
    <main className="home-shell">
      <header className="home-header">
        <Link className="brand" href="/dashboard" aria-label={t("brand")}>
          <span className="brand-mark" aria-hidden="true">⛽</span>
          <span>{t("brand")}</span>
        </Link>
        <Link className="back-link" href="/">{landing("signOut")}</Link>
      </header>

      <section className="home-intro" aria-labelledby="dashboard-title">
        <div>
          <h1 id="dashboard-title">{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <SpeakerButton text={`${t("title")}. ${t("subtitle")}`} phraseId="dashboard-intro" />
      </section>

      <nav className="action-list" aria-label={t("actionsLabel")}>
        {actions.map(({ key, icon, href }) => {
          const label = t(`actions.${key}`);
          return (
            <div className="action-row" key={key}>
              <Link className="action-link" href={href}>
                <span className="action-icon" aria-hidden="true">{icon}</span>
                <span>{label}</span>
              </Link>
              <SpeakerButton text={label} phraseId={`dashboard-action-${key}`} />
            </div>
          );
        })}
      </nav>

      <p className="safety-note" role="note">{t("safety")}</p>
    </main>
  );
}
