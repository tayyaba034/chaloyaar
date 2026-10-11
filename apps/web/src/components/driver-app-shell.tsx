"use client";

import { useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { saveAutoReadPreference, signOutAction } from "@/app/actions";
import { SpeakerButton } from "./speaker-button";

const driverNavigation = [
  { key: "stations", href: "/app/stations", icon: "⛽" },
  { key: "truecost", href: "/app/truecost", icon: "🪙" },
  { key: "help", href: "/app/help", icon: "🧰" },
  { key: "vehicle", href: "/app/vehicle", icon: "🚗" },
] as const;

const languageLocales: AppLocale[] = ["ur", "en", "ur-Latn", "pa-Arab"];

export function DriverAppShell({
  children,
  authenticated,
  displayName,
  autoReadInitially,
}: {
  children: ReactNode;
  authenticated: boolean;
  displayName: string | null;
  autoReadInitially: boolean;
}) {
  const t = useTranslations("shell.driver");
  const languageT = useTranslations("language");
  const safetyT = useTranslations("home");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [autoRead, setAutoRead] = useState(autoReadInitially);
  const [preferenceError, setPreferenceError] = useState("");
  const isStationPage = pathname === "/app/stations" || pathname.startsWith("/app/stations/");
  const currentTitle = pathname.startsWith("/app/stations")
    ? t("navigation.stations")
    : t("navigation.home");

  function changeLanguage(value: string) {
    if (languageLocales.includes(value as AppLocale)) {
      router.replace(pathname, { locale: value as AppLocale });
    }
  }

  function updateAutoRead(enabled: boolean) {
    setAutoRead(enabled);
    setPreferenceError("");
    void saveAutoReadPreference(enabled).catch((error: unknown) => {
      console.error("Auto-read preference could not be saved", error);
      setAutoRead(!enabled);
      setPreferenceError(t("settingsError"));
    });
  }

  const navigation = (
    <nav className="driver-navigation" aria-label={t("navigationLabel")}>
      {driverNavigation.map(({ key, href, icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={key}
            className={`driver-nav-link${active ? " is-active" : ""}`}
            href={href}
            aria-current={active ? "page" : undefined}
          >
            <span className="driver-nav-icon" aria-hidden="true">{icon}</span>
            <span>{t(`navigation.${key}`)}</span>
            {active && <span className="driver-nav-active-mark">{t("active")}</span>}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className={`driver-app-shell${authenticated ? " has-driver-sidebar" : ""}${isStationPage ? " cy-root cy-station-app-shell" : ""}`}>
      {authenticated && <aside className="driver-sidebar">{navigation}</aside>}
      <div className="driver-app-column">
        <header className="driver-topbar">
          <Link className="brand" href={authenticated ? "/app" : "/"} aria-label={safetyT("brand")}>
            <span className="brand-mark" aria-hidden="true">⛽</span>
            <span>{safetyT("brand")}</span>
          </Link>
          <div className="driver-topbar-controls">
            <label className="language-select-label">
              <span className="sr-only">{languageT("change")}</span>
              <select
                aria-label={languageT("change")}
                value={locale}
                onChange={(event) => changeLanguage(event.currentTarget.value)}
              >
                {languageLocales.map((language) => (
                  <option key={language} value={language}>{languageT(`names.${language}`)}</option>
                ))}
              </select>
            </label>
            <SpeakerButton text={currentTitle} phraseId="driver-screen-title" />
            {authenticated && (
              <label className="auto-read-toggle">
                <input
                  type="checkbox"
                  checked={autoRead}
                  onChange={(event) => updateAutoRead(event.currentTarget.checked)}
                />
                <span>{t("autoRead")}</span>
              </label>
            )}
            {authenticated ? (
              <details className="profile-menu">
                <summary aria-label={t("profileMenu")}>
                  <span aria-hidden="true">👤</span>
                  <span>{displayName || t("profile")}</span>
                </summary>
                <div className="profile-menu-items">
                  <Link href="/app/settings">{t("settings")}</Link>
                  <form action={signOutAction.bind(null, locale)}>
                    <button type="submit">{t("logout")}</button>
                  </form>
                </div>
              </details>
            ) : (
              <Link className="header-signup-link" href="/auth/sign-in">
                {t("signIn")}
              </Link>
            )}
          </div>
        </header>
        {preferenceError && <p className="inline-alert" role="status">{preferenceError}</p>}
        {!authenticated && isStationPage && (
          <p className="guest-browse-note">{t("guestBrowse")}</p>
        )}
        <div className={`driver-content${authenticated ? " has-driver-nav" : ""}`}>
          {children}
        </div>
        <footer className="emergency-footer">{safetyT("safety")}</footer>
        {authenticated && navigation}
      </div>
    </div>
  );
}
