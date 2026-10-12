"use client";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Bell,
  Briefcase,
  Car,
  CaretDown,
  ClockCounterClockwise,
  GasPump,
  House,
  List,
  ChartPolar,
  Storefront,
  ListChecks,
  MapPin,
  SignOut,
  SlidersHorizontal,
  UserCircle,
  Wallet,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { signOutAction } from "@/app/actions";
import { SpeakerButton } from "./speaker-button";
import { useAppVoice } from "./use-app-voice";
import { NotificationList } from "./notification-list";

const nav = [
  { key: "home", href: "/app", icon: House },
  { key: "stations", href: "/app/stations", icon: GasPump },
  { key: "truecost", href: "/app/truecost", icon: Wallet },
  { key: "help", href: "/app/help", icon: Wrench },
  { key: "vehicle", href: "/app/vehicle", icon: Car },
  { key: "history", href: "/app/fuel-history", icon: ClockCounterClockwise },
  { key: "profile", href: "/app/profile", icon: UserCircle },
  { key: "places", href: "/app/places", icon: Storefront },
  { key: "intelligence", href: "/app/station-intelligence", icon: ChartPolar },
  { key: "business", href: "/app/business", icon: Briefcase },
  { key: "savedPlaces", href: "/app/saved-places", icon: MapPin },
  { key: "features", href: "/app/features", icon: ListChecks },
] as const;
type Profile = {
  display_name: string | null;
  driver_auto_read: boolean;
  driver_notifications: boolean;
  driver_reduced_motion: boolean;
};
type RequestUpdate = {
  id: string;
  service_type: string;
  status: string;
  updated_at: string;
  is_demo: boolean;
};
export function DriverAppShell({
  children,
  authenticated,
  displayName,
  autoReadInitially,
  userId,
}: {
  children: ReactNode;
  authenticated: boolean;
  displayName: string | null;
  autoReadInitially: boolean;
  userId?: string;
}) {
  const t = useTranslations("shell.driver"),
    languages = useTranslations("language"),
    home = useTranslations("home"),
    driver = useTranslations("dashboard.driver");
  const locale = useLocale() as AppLocale,
    pathname = usePathname(),
    router = useRouter();
  const [menu, setMenu] = useState(false),
    [profileMenu, setProfileMenu] = useState(false),
    [notifications, setNotifications] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    display_name: displayName,
    driver_auto_read: autoReadInitially,
    driver_notifications: true,
    driver_reduced_motion: false,
  });
  const [updates, setUpdates] = useState<RequestUpdate[]>([]),
    [updatesError, setUpdatesError] = useState("");
  const profileRef = useRef<HTMLDivElement>(null),
    bellRef = useRef<HTMLDivElement>(null),
    menuRef = useRef<HTMLButtonElement>(null);
  const speak = useAppVoice();
  const label = (key: string) =>
    key === "history"
      ? "Fuel History"
      : key === "profile"
        ? "Profile"
        : t(`navigation.${key}`);
  const active = nav.find((item) =>
    item.href === "/app"
      ? pathname === "/app"
      : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  const title =
    pathname === "/app/settings"
      ? t("settings")
      : active
        ? label(active.key)
        : t("navigation.home");
  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/driver/profile", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body) => {
          if (body?.profile && !controller.signal.aborted)
            setProfile(body.profile);
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("driver-profile-updated", load);
    return () => {
      controller.abort();
      window.removeEventListener("driver-profile-updated", load);
    };
  }, [authenticated, userId]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node))
        setProfileMenu(false);
      if (!bellRef.current?.contains(event.target as Node))
        setNotifications(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenu(false);
      setProfileMenu(false);
      setNotifications(false);
      menuRef.current?.focus();
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!authenticated || !notifications || !profile.driver_notifications)
      return;
    const controller = new AbortController();
    const load = () => {
      void fetch("/api/requests", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error("Request updates could not be loaded.");
          return response.json();
        })
        .then((body) => {
          if (!controller.signal.aborted) {
            setUpdates(body.requests);
            setUpdatesError("");
          }
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setUpdatesError("Request updates are temporarily unavailable.");
        });
    };
    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [authenticated, notifications, profile.driver_notifications]);
  useEffect(() => {
    if (!authenticated || !profile.driver_auto_read) return;
    void speak(title, `driver-${pathname}`, locale).catch(() => undefined);
    return () => window.speechSynthesis?.cancel();
  }, [authenticated, profile.driver_auto_read, title, pathname, locale, speak]);
  const closeMenus = () => {
    setMenu(false);
    setProfileMenu(false);
    setNotifications(false);
  };
  return (
    <div
      className={`cy-root driver-workspace${authenticated ? "" : " driver-guest"}${profile.driver_reduced_motion ? " driver-reduced-motion" : ""}`}
    >
      <a className="cy-skip" href="#driver-content">
        Skip to content
      </a>
      <header className="driver-account-header">
        <div className="driver-brand-group">
          {authenticated && (
            <button
              ref={menuRef}
              className="driver-icon-button driver-menu-button"
              title="Navigation"
              aria-label="Navigation"
              aria-expanded={menu}
              aria-controls="driver-account-nav"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X /> : <List />}
            </button>
          )}
          <Link
            className="driver-account-brand"
            href={authenticated ? "/app" : "/"}
            onClick={closeMenus}
          >
            <Image
              src="/images/chalo-yaar-logo.png"
              width={44}
              height={44}
              alt=""
              priority
            />
            <span>
              Chalo Yaar<small>Fuel. Help. Move.</small>
            </span>
          </Link>
        </div>
        <div className="driver-header-tools">
          <select
            aria-label={languages("change")}
            value={locale}
            onChange={(event) =>
              router.replace(pathname, {
                locale: event.target.value as AppLocale,
              })
            }
          >
            {routing.locales.map((value) => (
              <option key={value} value={value}>
                {languages(`names.${value}`)}
              </option>
            ))}
          </select>
          <SpeakerButton text={title} phraseId={`driver-${pathname}`} />
          {authenticated ? (
            <>
              <div className="driver-header-popover" ref={bellRef}>
                <button
                  className="driver-icon-button"
                  title="Request updates"
                  aria-label="Request updates"
                  aria-expanded={notifications}
                  onClick={() => {
                    setNotifications(!notifications);
                    setProfileMenu(false);
                  }}
                >
                  <Bell />
                </button>
                {notifications && (
                  <div className="driver-popover driver-update-list">
                    <h2>{t("notificationsTitle")}</h2>
                    <NotificationList userId={userId} onNavigate={closeMenus} />
                    <h2>Request updates</h2>
                    {!profile.driver_notifications ? (
                      <p>In-app updates are turned off in Settings.</p>
                    ) : updatesError ? (
                      <p role="status">{updatesError}</p>
                    ) : !updates.length ? (
                      <p>No request updates yet.</p>
                    ) : (
                      updates.slice(0, 5).map((item) => (
                        <Link
                          href={`/app/help/${item.id}`}
                          key={item.id}
                          onClick={closeMenus}
                        >
                          <strong>
                            {driver(`services.${item.service_type}`)}
                          </strong>
                          <span>
                            {driver(`requestStatuses.${item.status}`)}
                            {item.is_demo ? " / Demo" : ""}
                          </span>
                        </Link>
                      ))
                    )}
                    <Link href="/app/help" onClick={closeMenus}>
                      View request history
                    </Link>
                  </div>
                )}
              </div>
              <div className="driver-header-popover" ref={profileRef}>
                <button
                  className="driver-profile-button"
                  aria-label={t("profileMenu")}
                  aria-expanded={profileMenu}
                  onClick={() => {
                    setProfileMenu(!profileMenu);
                    setNotifications(false);
                  }}
                >
                  <span className="driver-avatar">
                    {(profile.display_name || "Driver")
                      .slice(0, 1)
                      .toUpperCase()}
                  </span>
                  <span className="driver-header-name">
                    {profile.display_name || "Driver"}
                  </span>
                  <CaretDown />
                </button>
                {profileMenu && (
                  <div className="driver-popover">
                    <Link href="/app/profile" onClick={closeMenus}>
                      <UserCircle />
                      Profile
                    </Link>
                    <Link href="/app/settings" onClick={closeMenus}>
                      <SlidersHorizontal />
                      {t("settings")}
                    </Link>
                    <form action={signOutAction.bind(null, locale)}>
                      <button type="submit">
                        <SignOut />
                        {t("logout")}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link className="cy-button cy-button--accent" href="/auth/sign-in">
              {t("signIn")}
            </Link>
          )}
        </div>
      </header>
      {authenticated && (
        <>
          {menu && (
            <button
              className="driver-menu-backdrop"
              aria-label="Close navigation"
              onClick={() => setMenu(false)}
            />
          )}
          <aside
            id="driver-account-nav"
            className={`driver-account-sidebar${menu ? " is-open" : ""}`}
          >
            <span className="driver-nav-eyebrow">DRIVER ACCOUNT</span>
            <nav aria-label={t("navigationLabel")}>
              {nav.map(({ key, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className={active?.key === key ? "is-active" : ""}
                  aria-current={active?.key === key ? "page" : undefined}
                  onClick={closeMenus}
                >
                  <Icon weight={active?.key === key ? "fill" : "regular"} />
                  <span>{label(key)}</span>
                </Link>
              ))}
            </nav>
            <div className="driver-sidebar-foot">Faisalabad pilot</div>
          </aside>
        </>
      )}
      <div className="driver-workspace-body" id="driver-content">
        {children}
        <footer className="driver-account-footer">{home("safety")}</footer>
      </div>
    </div>
  );
}
