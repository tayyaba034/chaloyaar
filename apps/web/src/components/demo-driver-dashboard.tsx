"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, BatteryCharging, Car, CaretDown, Check, GasPump, Globe, Info, List, MapPin, Minus, Plus, SlidersHorizontal, Tire, Truck, UserCircle, Wallet, Wrench, X } from "@phosphor-icons/react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";
import { demoStations } from "@/lib/station-data";
import { SpeakerButton } from "./speaker-button";
import { useAppVoice } from "./use-app-voice";
import { DemoDriverProfile } from "./demo-driver-profile";
import { useDemoAccount } from "./use-demo-account";

export type DemoSection = "stations" | "truecost" | "help" | "vehicle" | "settings" | "profile";
const navigation = [
  { key: "stations", icon: GasPump }, { key: "truecost", icon: Wallet },
  { key: "help", icon: Wrench }, { key: "vehicle", icon: Car },
] as const;

export function DemoDriverDashboard({ section }: { section: DemoSection }) {
  const t = useTranslations("stations");
  const shell = useTranslations("shell.driver");
  const language = useTranslations("language");
  const home = useTranslations("home");
  const placeholder = useTranslations("dashboard.placeholders");
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const speak = useAppVoice();
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const { account, update } = useDemoAccount();
  const autoRead = account.preferences.autoRead;
  const setAutoRead = (enabled: boolean) => {
    if (!update(current => ({ ...current, preferences: { ...current.preferences, autoRead: enabled } }))) setVoiceMessage("Browser storage is unavailable. Preference could not be saved.");
  };
  const [voiceMessage, setVoiceMessage] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const title = section === "stations" ? t("title") : section === "profile" ? "My driver profile" : placeholder(`${section}.title`);
  const subtitle = section === "stations" ? t("subtitle") : section === "profile" || section === "vehicle" || section === "settings" ? "Your demo account, vehicles and activity, all in one place." : placeholder(`${section}.message`);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfile(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (profile) { setProfile(false); profileButton.current?.focus(); }
      if (menu) { setMenu(false); menuButton.current?.focus(); }
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu, profile]);

  useEffect(() => {
    if (!autoRead) return;
    let active = true;
    void speak(`${title}. ${subtitle}`, `demo-${section}`, locale).then((result) => {
      if (active && result === "unavailable") setVoiceMessage("Speech is unavailable for this language on this device.");
    }).catch(() => { if (active) setVoiceMessage("Speech could not be played."); });
    return () => { active = false; window.speechSynthesis?.cancel(); };
  }, [autoRead, title, subtitle, section, locale, speak]);

  const closeNavigation = () => { setProfile(false); setMenu(false); };
  return (
    <div className={`cy-root demo-dashboard${account.preferences.reducedMotion ? " demo-reduced-motion" : ""}`}>
      <a className="cy-skip" href="#demo-content">Skip to content</a>
      <header className="demo-header">
        <div className="demo-brand-group">
          <button ref={menuButton} type="button" className="demo-icon-button demo-menu-toggle" title="Navigation" aria-label="Navigation" aria-expanded={menu} aria-controls="demo-sidebar" onClick={() => setMenu(!menu)}>{menu ? <X /> : <List />}</button>
          <Link className="demo-brand" href="/demo" onClick={closeNavigation}>
            <Image src="/images/chalo-yaar-logo.png" width={48} height={48} alt="" priority />
            <span>Chalo Yaar<span className="demo-brand-caption">Fuel. Help. Move.</span></span>
          </Link>
        </div>
        <div className="demo-header-controls">
          <label className="demo-language"><Globe aria-hidden="true" /><select aria-label={language("change")} value={locale} onChange={(event) => router.replace(pathname, { locale: event.target.value as AppLocale })}>{routing.locales.map((value) => <option key={value} value={value}>{language(`names.${value}`)}</option>)}</select></label>
          <SpeakerButton text={`${title}. ${subtitle}`} phraseId={`demo-${section}`} />
          <label className="demo-auto-read" title={home("autoRead")}><input type="checkbox" aria-label={home("autoRead")} checked={autoRead} onChange={(event) => { setAutoRead(event.target.checked); setVoiceMessage(""); }} /><span>{shell("autoRead")}</span></label>
          <div ref={profileRef} className="demo-profile">
            <button ref={profileButton} className="demo-profile-trigger" aria-label={`${account.name} profile`} aria-expanded={profile} aria-controls="demo-profile-links" onClick={() => setProfile(!profile)}><span className={`demo-avatar avatar-${account.avatar}`}>{account.name.slice(0, 1).toUpperCase()}</span><span className="demo-profile-name">{account.name}<small>Demo account</small></span><CaretDown aria-hidden="true" /></button>
            {profile && <div id="demo-profile-links" className="demo-profile-links"><span><UserCircle /> {account.name}</span><Link href="/demo/profile" onClick={closeNavigation}>My profile</Link><Link href="/demo/vehicle" onClick={closeNavigation}>{shell("navigation.vehicle")}</Link><Link href="/demo/settings" onClick={closeNavigation}>{shell("settings")}</Link><Link href="/auth/sign-in" onClick={closeNavigation}>{shell("signIn")}</Link></div>}
          </div>
        </div>
      </header>
      {menu && <button className="demo-menu-backdrop" aria-label="Close navigation" onClick={() => setMenu(false)} />}
      <aside id="demo-sidebar" className={`demo-sidebar${menu ? " is-open" : ""}`}>
        <span className="demo-nav-caption">YOUR DAILY DRIVE</span>
        <nav aria-label={shell("navigationLabel")}>{navigation.map(({ key, icon: Icon }) => <Link key={key} href={`/demo/${key}`} onClick={closeNavigation} className={`demo-nav-link${section === key ? " is-active" : ""}`} aria-current={section === key ? "page" : undefined}><Icon weight={section === key ? "fill" : "regular"} aria-hidden="true" /><span>{shell(`navigation.${key}`)}</span>{section === key && <ArrowRight aria-hidden="true" />}</Link>)}</nav>
        <div className="demo-sidebar-bottom"><span><MapPin weight="fill" /> Faisalabad pilot</span><p>{t("demo")}</p><Link href="/demo/settings" onClick={closeNavigation}><SlidersHorizontal />{shell("settings")}</Link></div>
      </aside>
      <main id="demo-content" className="demo-main">
        <div className="demo-page-heading"><div><span className="demo-city"><MapPin weight="fill" />{t("city")}<span className="demo-city-dot" /> PILOT</span><h1>{title}</h1><p>{subtitle}</p></div><span className="demo-label">{t("demo")}</span></div>
        {voiceMessage && <p role="status" className="demo-notice">{voiceMessage}</p>}
        {section === "stations" ? <DemoStations /> : section === "truecost" ? <DemoCost /> : section === "help" ? <DemoHelp /> : <DemoDriverProfile key={section} initialTab={section === "vehicle" ? "vehicles" : section === "settings" ? "preferences" : "overview"} />}
        <footer className="demo-footer"><Info aria-hidden="true" /><span>{home("safety")}</span></footer>
      </main>
    </div>
  );
}

function DemoStations() {
  const t = useTranslations("stations");
  const { account, update } = useDemoAccount();
  const [saveMessage, setSaveMessage] = useState("");
  const [fuel, setFuel] = useState("all");
  const [area, setArea] = useState("all");
  const [selected, setSelected] = useState(demoStations[0].id);
  const [zoom, setZoom] = useState(1);
  const [detail, setDetail] = useState(false);
  const visible = demoStations.filter((station) => (fuel === "all" || station.supportedFuels.includes(fuel as "petrol" | "diesel")) && (area === "all" || station.id === area));
  const active = visible.find((station) => station.id === selected) ?? visible[0];
  return <>
    <section className="demo-search" aria-label={t("filtersTitle")}>
      <label><MapPin aria-hidden="true" /><span>{t("areaLabel")}<select value={area} onChange={(event) => { setArea(event.target.value); setDetail(false); }}><option value="all">Faisalabad</option>{demoStations.map((station, index) => <option key={station.id} value={station.id}>{t(`areas.${["city-centre", "susan-road", "d-ground"][index]}`)}</option>)}</select></span></label>
      <div className="demo-fuel-filters" role="group" aria-label={t("fuelFilter")}>{["all", "petrol", "diesel"].map((value) => <button key={value} aria-pressed={value === fuel} className={value === fuel ? "is-active" : ""} onClick={() => { setFuel(value); setDetail(false); }}>{value !== "all" && <GasPump aria-hidden="true" />}{t(`fuels.${value}`)}</button>)}</div>
    </section>
    <div className="demo-result-heading"><h2>{t("nearbyTitle")}</h2><span>{t("resultCount", { count: visible.length })}</span></div>
    <div className="demo-discovery-grid">
      <section className="demo-station-list" aria-label={t("nearbyTitle")}>
        {visible.map((station, index) => <article key={station.id} className={`demo-station-card${active?.id === station.id ? " is-selected" : ""}`}><div className="demo-station-name"><span className="demo-pump"><GasPump weight="fill" /></span><div><h3>{station.name}</h3><p>{station.address}</p></div></div><div className="demo-station-meta"><span className="demo-label">{t("demo")}</span><span>{t("unverified")}</span></div><div className="demo-station-facts"><span><span className="demo-unknown-dot" />{t("unknownStatus")}</span><span>{t("unknownPrice")}</span></div><div className="demo-station-bottom"><span>{station.supportedFuels.map((value) => t(`fuels.${value}`)).join(" / ")}</span><button onClick={() => { setSelected(station.id); setDetail(true); }} aria-label={`View ${station.name}`} aria-pressed={detail && active?.id === station.id}>View details <ArrowRight /></button></div><span className="sr-only">Station {index + 1}</span></article>)}
        {!visible.length && <p className="demo-notice">{t("emptyTitle")}. {t("emptyMessage")}</p>}
      </section>
      <section className="demo-map-panel" aria-label="Faisalabad schematic demo map">
        <div className="demo-map-header"><span><MapPin />Faisalabad</span><span>Schematic · Demo</span></div>
        <div className="demo-map">
          <svg viewBox="0 0 700 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="demo-map-roads" style={{ transform: `scale(${zoom})` }}>
            <rect width="700" height="560" fill="#e9eadf" />
            <g fill="#dde3d0"><path d="M0 20h150v120H0zM510 0h190v120H510zM420 380h280v180H420zM0 350h180v210H0z" /></g>
            <g fill="#dfdfd2" stroke="#f5f5ed" strokeWidth="8"><path d="M190 20h130v100H190zM365 20h100v100H365zM20 180h120v115H20zM190 180h135v110H190zM370 180h100v110H370zM520 180h160v115H520zM225 360h120v175H225z" /></g>
            <g fill="none" strokeLinecap="round"><path d="M-20 155H720M165-20v600M345-20v600M490-20v600M-20 325H720" stroke="#fafaf4" strokeWidth="22" /><path d="M-20 155H720M165-20v600M345-20v600M490-20v600M-20 325H720" stroke="#d5d5c6" strokeWidth="2" /><path d="M-20 490Q220 285 375 315T720 205" stroke="#fafaf4" strokeWidth="32" /><path d="M-20 490Q220 285 375 315T720 205" stroke="#dbceaf" strokeWidth="3" /></g>
          </svg>
          <span className="demo-map-area demo-map-area-one">City Centre</span><span className="demo-map-area demo-map-area-two">Susan Road</span><span className="demo-map-area demo-map-area-three">D-Ground</span>
          {visible.map((station) => { const index = demoStations.indexOf(station); return <button key={station.id} className={`demo-map-marker demo-map-marker-${index}${active?.id === station.id ? " is-selected" : ""}`} style={{ left: `${50 + ([31, 54, 77][index] - 50) * zoom}%`, top: `${50 + ([31, 58, 43][index] - 50) * zoom}%` }} title={station.name} aria-label={`Select ${station.name}`} onClick={() => { setSelected(station.id); setDetail(true); }}><GasPump weight="fill" /><span>{index + 1}</span></button>; })}
          <div className="demo-map-controls"><button className="demo-icon-button" title="Zoom in" aria-label="Zoom in" disabled={zoom >= 1.4} onClick={() => setZoom(Math.min(1.4, zoom + .2))}><Plus /></button><button className="demo-icon-button" title="Zoom out" aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - .2))}><Minus /></button></div>
          {detail && active && <div className="demo-map-detail"><button className="demo-icon-button" title="Close station details" aria-label="Close station details" onClick={() => setDetail(false)}><X /></button><span className="demo-label">{t("demo")}</span><h3>{active.name}</h3><p>{t("unknownStatus")} · {t("unknownPrice")}</p><p>Sample coordinates: {active.latitude}, {active.longitude}</p><button className="demo-text-button" aria-pressed={account.savedStations.includes(active.id)} onClick={() => {
            const saved = account.savedStations.includes(active.id);
            const success = update(current => ({ ...current, savedStations: saved ? current.savedStations.filter(id => id !== active.id) : [...current.savedStations, active.id] }));
            setSaveMessage(success ? saved ? "Station removed from demo profile." : "Station saved to demo profile." : "Browser storage unavailable.");
          }}>{account.savedStations.includes(active.id) ? "Unsave station" : "Save station"}</button></div>}
          <span className="demo-map-disclaimer">Illustrative layout. Not for navigation.</span>
        </div>
      </section>
    </div>
    <p className="demo-data-note"><Info />Sample station information. No confirmed stock, prices or report timestamps.</p>
    {saveMessage && <p className="demo-notice" role="status">{saveMessage}</p>}
  </>;
}

function DemoCost() {
  const [values, setValues] = useState({ litres: "", price: "", distance: "", economy: "" });
  const ready = Object.values(values).every((value) => value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0) && Number(values.economy) > 0;
  const purchase = Number(values.litres) * Number(values.price);
  const detour = Number(values.distance) / Number(values.economy) * Number(values.price);
  return <section className="demo-form-section"><h2>Estimate your fill-up</h2><p>Use your own figures. No verified discounts are applied.</p><div className="demo-form-grid">{([{ key: "litres", label: "Fuel purchase (litres)" }, { key: "price", label: "Your fuel price (PKR/litre)" }, { key: "distance", label: "Extra road distance (km)" }, { key: "economy", label: "Vehicle economy (km/litre)" }] as const).map(({ key, label }) => <label key={key}>{label}<input type="number" min={key === "economy" ? "0.1" : "0"} step="any" value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}</div><div className="demo-calculation" aria-live="polite"><Wallet /><div><span>Estimated total</span><strong>{ready ? `PKR ${(purchase + detour).toLocaleString("en-PK", { maximumFractionDigits: 2 })}` : "Enter your figures"}</strong>{ready && <p>Fuel: PKR {purchase.toFixed(2)} + detour fuel: PKR {detour.toFixed(2)}. Discount: PKR 0.</p>}</div></div><p className="demo-data-note">Estimate = litres × price + extra road distance ÷ economy × price. Distance is user supplied; no route or savings is inferred.</p></section>;
}

function DemoHelp() {
  const { update } = useDemoAccount();
  const [service, setService] = useState("puncture");
  const [preview, setPreview] = useState(false);
  const t = useTranslations("dashboard.driver.services");
  return <section className="demo-form-section"><h2>What do you need help with?</h2><div className="demo-service-options">{([{ key: "puncture", icon: Tire }, { key: "battery", icon: BatteryCharging }, { key: "towing", icon: Truck }] as const).map(({ key, icon: Icon }) => <button key={key} aria-pressed={key === service} className={key === service ? "is-active" : ""} onClick={() => { setService(key); setPreview(false); }}><Icon /><span>{t(key)}</span>{key === service && <Check />}</button>)}</div><p>No approved providers are connected to this demo. Quotes and arrival times are unavailable.</p><button className="demo-primary" disabled={preview} onClick={() => {
    update(current => ({ ...current, requests: [{ id: `DEMO-${crypto.randomUUID().slice(0, 8)}`, service: t(service), date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Karachi" }), status: "Previewed" }, ...current.requests] }));
    setPreview(true);
  }}>Preview request <ArrowRight /></button>{preview && <p className="demo-notice" role="status">Demo request preview: {t(service)}. No request was sent and no provider was contacted.</p>}</section>;
}
