"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Car,
  Coins,
  GasPump,
  MapPin,
  MapTrifold,
  NavigationArrow,
  Translate,
  Wrench,
} from "@phosphor-icons/react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { saveLanguageChoice } from "@/app/actions";
import { SpeakerButton } from "./speaker-button";
import { HeroPreview } from "./landing/hero-preview";
import { Reveal } from "./landing/reveal";
import { StatusChip, statusKeys } from "./landing/status";

const languageOptions = [
  { locale: "ur", labelKey: "ur", direction: "rtl" },
  { locale: "en", labelKey: "en", direction: "ltr" },
  { locale: "ur-Latn", labelKey: "ur-Latn", direction: "ltr" },
  { locale: "pa-Arab", labelKey: "pa-Arab", direction: "rtl" },
] as const;

// The four home-screen actions. Each destination is available from the app.
const appActions = [
  { key: "fuel", icon: GasPump, href: "/app/stations" },
  { key: "help", icon: Wrench, href: "/app/help" },
  { key: "savings", icon: Coins, href: "/app/truecost" },
  { key: "car", icon: Car, href: "/app/vehicle" },
] as const;

const steps = [
  { key: "location", icon: MapPin },
  { key: "choose", icon: MapTrifold },
  { key: "go", icon: NavigationArrow },
] as const;

export function HomeExperience({
  languageSelected,
}: {
  languageSelected: boolean;
}) {
  const t = useTranslations("home");
  const languageT = useTranslations("language");
  const landingT = useTranslations("landing");
  const pathname = usePathname();
  const router = useRouter();
  const [showLanguagePicker, setShowLanguagePicker] = useState(!languageSelected);
  const [preferenceError, setPreferenceError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (showLanguagePicker) {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>(".language-choice")
        ?.focus();
    }
  }, [showLanguagePicker]);

  function keepLanguagePickerAccessible(
    event: KeyboardEvent<HTMLDialogElement>,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }
    if (event.key !== "Tab") return;

    const choices = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const activeIndex = choices.findIndex(
      (choice) => choice === event.currentTarget.ownerDocument.activeElement,
    );
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      choices.at(-1)?.focus();
    } else if (!event.shiftKey && activeIndex === choices.length - 1) {
      event.preventDefault();
      choices[0]?.focus();
    }
  }

  async function selectLanguage(selectedLocale: AppLocale) {
    try {
      await saveLanguageChoice(selectedLocale);
      setShowLanguagePicker(false);
      router.replace(pathname, { locale: selectedLocale });
    } catch (error) {
      console.error("Language selection could not be saved", error);
      setPreferenceError(languageT("error"));
    }
  }

  const [brandFirst, ...brandRest] = t("brand").split(" ");

  return (
    <>
      <div className="cy-root cy-landing" inert={showLanguagePicker || undefined}>
        <a className="cy-skip" href="#cy-main">{landingT("skipToContent")}</a>
        <header className="cy-header">
          <div className="cy-container cy-header-inner">
            <Link className="cy-brand" href="/" aria-label={t("brand")}>
              <span className="cy-brand-mark" aria-hidden="true">
                <GasPump weight="fill" />
              </span>
              <span className="cy-brand-word" aria-hidden="true" translate="no">
                {brandFirst} <span>{brandRest.join(" ")}</span>
              </span>
            </Link>
            <nav className="cy-nav" aria-label={landingT("navigationLabel")}>
              <Link className="cy-nav-link cy-hide-mobile" href="/app/stations">
                {landingT("browseStations")}
              </Link>
              <button
                className="cy-nav-link cy-nav-language"
                type="button"
                onClick={() => setShowLanguagePicker(true)}
              >
                <Translate aria-hidden="true" weight="bold" />
                {languageT("change")}
              </button>
              <Link className="cy-nav-link" href="/auth/sign-in">
                {landingT("signIn")}
              </Link>
              <Link className="cy-button cy-button--dark cy-hide-mobile" href="/auth/sign-up">
                {landingT("signUp")}
              </Link>
            </nav>
          </div>
        </header>

        <main id="cy-main">
          <section className="cy-container cy-hero" aria-labelledby="cy-hero-title">
            <div className="cy-hero-copy">
              <p className="cy-eyebrow">
                <MapPin aria-hidden="true" weight="fill" />
                {landingT("city")}
              </p>
              <h1 id="cy-hero-title">{landingT("heroTitle")}</h1>
              <p className="cy-hero-lede">{landingT("heroSubtitle")}</p>
              <p className="cy-hero-help-copy">
                <strong>{landingT("heroHelpTitle")}</strong>{" "}
                {landingT("heroHelpBody")}
              </p>
              <div className="cy-hero-actions">
                <Link href="/app/help" className="cy-button cy-button--accent">
                  {landingT("getHelp")}
                  <ArrowRight className="cy-flip" aria-hidden="true" weight="bold" />
                </Link>
                <Link href="/app/stations" className="cy-button cy-button--outline">
                  {landingT("browseStations")}
                  <ArrowRight className="cy-flip" aria-hidden="true" weight="bold" />
                </Link>
                <Link href="/auth/sign-up" className="cy-button cy-button--outline">
                  {landingT("signUp")}
                </Link>
                <SpeakerButton
                  text={`${landingT("heroTitle")} ${landingT("heroSubtitle")}`}
                  phraseId="landing-hero"
                />
              </div>
            </div>
            <HeroPreview />
          </section>

          <section className="cy-facts" aria-label={landingT("facts.label")}>
            <dl className="cy-container cy-facts-inner">
              {([
                ["3", "fuels"],
                ["5", "labels"],
                ["4", "languages"],
              ] as const).map(([value, key], index) => (
                <Reveal key={key} className="cy-fact" delay={index * 0.08}>
                  <dt>{value}</dt>
                  <dd>{landingT(`facts.${key}`)}</dd>
                </Reveal>
              ))}
            </dl>
          </section>

          <section className="cy-container cy-section" aria-labelledby="cy-legend-title">
            <Reveal className="cy-section-head">
              <h2 id="cy-legend-title">{landingT("legendTitle")}</h2>
              <p>{landingT("legendBody")}</p>
              <SpeakerButton
                text={`${landingT("legendTitle")} ${landingT("legendBody")}`}
                phraseId="landing-legend"
              />
            </Reveal>
            <Reveal className="cy-legend" delay={0.1}>
              {[...statusKeys].reverse().map((status) => (
                <article key={status} className={`cy-legend-cell cy-legend-cell--${status}`}>
                  <StatusChip status={status} label={landingT(`status.${status}`)} />
                  <p>{landingT(`legend.${status}`)}</p>
                </article>
              ))}
            </Reveal>
          </section>

          <section className="cy-section cy-actions-section" aria-labelledby="cy-actions-title">
            <div className="cy-container">
              <Reveal className="cy-section-head">
                <h2 id="cy-actions-title">{landingT("actionsTitle")}</h2>
                <p>{landingT("actionsBody")}</p>
              </Reveal>
              <ul className="cy-actions">
                {appActions.map(({ key, icon: ActionIcon, href }, index) => (
                  <li key={key}>
                    <Reveal delay={index * 0.06}>
                      <Link className="cy-action" href={href}>
                        <span className="cy-action-icon" aria-hidden="true">
                          <ActionIcon weight="duotone" />
                        </span>
                        <span className="cy-action-name">{t(`actions.${key}`)}</span>
                        <span className="cy-action-text">{landingT(`actions.${key}`)}</span>
                        <span className="cy-tag cy-tag--live">
                          {landingT("liveTag")}
                        </span>
                        <ArrowRight className="cy-action-arrow cy-flip" aria-hidden="true" weight="bold" />
                      </Link>
                    </Reveal>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="cy-container cy-section cy-voice" aria-labelledby="cy-voice-title">
            <Reveal className="cy-voice-copy">
              <h2 id="cy-voice-title">{landingT("voiceTitle")}</h2>
              <p>{landingT("voiceBody")}</p>
              <div className="cy-voice-try">
                <SpeakerButton text={landingT("voiceSample")} phraseId="landing-voice-sample" />
                <span>{landingT("voiceTry")}</span>
              </div>
            </Reveal>
            <Reveal className="cy-voice-names" delay={0.1}>
              {languageOptions.map((option) => (
                <span
                  key={option.locale}
                  className="cy-voice-name"
                  lang={option.locale}
                  dir={option.direction}
                >
                  {languageT(`names.${option.labelKey}`)}
                </span>
              ))}
            </Reveal>
          </section>

          <section className="cy-container cy-section" aria-labelledby="cy-steps-title">
            <Reveal className="cy-section-head">
              <h2 id="cy-steps-title">{landingT("stepsTitle")}</h2>
            </Reveal>
            <ol className="cy-steps">
              {steps.map(({ key, icon: StepIcon }, index) => (
                <li key={key}>
                  <Reveal delay={index * 0.1}>
                    <span className="cy-step-marker" aria-hidden="true">
                      <span>{index + 1}</span>
                      <StepIcon weight="bold" />
                    </span>
                    <h3>{landingT(`steps.${key}.title`)}</h3>
                    <p>{landingT(`steps.${key}.description`)}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </section>

          <section className="cy-container cy-join-wrap" aria-labelledby="cy-join-title">
            <Reveal className="cy-join">
              <span className="cy-join-medallion" aria-hidden="true">
                <Image src="/images/chalo-yaar-logo.png" alt="" width={160} height={160} />
              </span>
              <h2 id="cy-join-title">{landingT("joinTitle")}</h2>
              <p>{landingT("joinDescription")}</p>
              <div className="cy-join-actions">
                <Link className="cy-button cy-button--accent" href="/auth/sign-up">
                  {landingT("signUp")}
                  <ArrowRight className="cy-flip" aria-hidden="true" weight="bold" />
                </Link>
                <Link className="cy-button cy-button--ghost-light" href="/auth/sign-in">
                  {landingT("signIn")}
                </Link>
              </div>
            </Reveal>
          </section>
        </main>

        <footer className="cy-footer">
          <div className="cy-container cy-footer-inner">
            <div className="cy-footer-brand">
              <span className="cy-brand-word" aria-hidden="true" translate="no">
                {brandFirst} <span>{brandRest.join(" ")}</span>
              </span>
              <p>{landingT("footerPilot")}</p>
            </div>
            <nav aria-label={landingT("footerLinksLabel")} className="cy-footer-links">
              <Link href="/app/stations">{landingT("browseStations")}</Link>
              <Link href="/auth/sign-in">{landingT("signIn")}</Link>
              <button type="button" onClick={() => setShowLanguagePicker(true)}>
                {languageT("change")}
              </button>
            </nav>
            <p className="cy-safety" role="note">{t("safety")}</p>
          </div>
        </footer>
      </div>

      {showLanguagePicker && (
        <dialog
          ref={dialogRef}
          className="language-dialog"
          open
          role="dialog"
          aria-modal="true"
          aria-labelledby="language-title"
          onKeyDown={keepLanguagePickerAccessible}
        >
          <div className="language-panel">
            <div className="home-intro">
              <div>
                <h2 id="language-title">{languageT("title")}</h2>
                <p>{languageT("description")}</p>
              </div>
              <SpeakerButton text={languageT("title")} phraseId="language-picker" />
            </div>
            {preferenceError && (
              <p className="voice-message" role="status" aria-live="polite">
                {preferenceError}
              </p>
            )}
            <div className="language-options">
              {languageOptions.map((option) => {
                const label = languageT(`names.${option.labelKey}`);
                return (
                  <div className="language-row" key={option.locale}>
                    <button
                      className="language-choice"
                      type="button"
                      dir={option.direction}
                      lang={option.locale}
                      onClick={() => void selectLanguage(option.locale)}
                    >
                      {label}
                    </button>
                    <SpeakerButton
                      text={label}
                      phraseId={`language-${option.locale}`}
                      locale={option.locale}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
