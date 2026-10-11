"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  DeviceMobile,
  EnvelopeSimple,
  GasPump,
  Megaphone,
  Wrench,
} from "@phosphor-icons/react";
import { Link, useRouter } from "@/i18n/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getSupabaseConfig } from "@/lib/supabase-config";
import { SpeakerButton } from "./speaker-button";

type AuthMethod = "email" | "phone";

// What an account adds. Only availability reports are live in this milestone.
const benefits = [
  { key: "report", icon: Megaphone, live: true },
  { key: "car", icon: Car, live: false },
  { key: "help", icon: Wrench, live: false },
] as const;

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const t = useTranslations("auth");
  const common = useTranslations("home");
  const landingT = useTranslations("landing");
  const locale = useLocale();
  const router = useRouter();
  const [method, setMethod] = useState<AuthMethod>("phone");
  const [identity, setIdentity] = useState("");
  const [password, setPassword] = useState("");
  const [passwordMode, setPasswordMode] = useState(false);
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { url: supabaseUrl, key: supabaseKey } = getSupabaseConfig();
  const configured = Boolean(supabaseUrl && supabaseKey);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage(t("notConfigured"));
        return;
      }
      const options = { shouldCreateUser: mode === "sign-up" };
      const result =
        method === "email"
          ? await supabase.auth.signInWithOtp({ email: identity, options })
          : await supabase.auth.signInWithOtp({ phone: identity, options });
      if (result.error) throw result.error;
      setCodeSent(true);
      setMessage(t("codeSent"));
    } catch (error) {
      console.error("Sign-in code could not be sent", error);
      setMessage(t("sendError"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage(t("notConfigured"));
        return;
      }
      const result =
        method === "email"
          ? await supabase.auth.verifyOtp({ email: identity, token: code, type: "email" })
          : await supabase.auth.verifyOtp({ phone: identity, token: code, type: "sms" });
      if (result.error) throw result.error;
      continueAfterSignIn();
    } catch (error) {
      console.error("One-time code verification failed", error);
      setMessage(t("verifyError"));
    } finally {
      setBusy(false);
    }
  }

  function continueAfterSignIn() {
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const continuation =
      requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? `/auth/continue?next=${encodeURIComponent(requestedNext)}`
        : "/auth/continue";
    router.replace(continuation);
    router.refresh();
  }

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setMessage(t("notConfigured"));
        return;
      }
      const result = await supabase.auth.signInWithPassword({
        email: identity,
        password,
      });
      if (result.error) throw result.error;
      continueAfterSignIn();
    } catch (error) {
      console.error("Password sign-in failed", error);
      setMessage(t("passwordError"));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "sign-up" ? t("signUpTitle") : t("signInTitle");
  const [brandFirst, ...brandRest] = common("brand").split(" ");

  return (
    <main className="cy-root cy-auth">
      <aside className="cy-auth-panel" aria-label={common("brand")}>
        <Link href="/" className="cy-brand cy-auth-brand" aria-label={common("brand")}>
          <span className="cy-brand-mark" aria-hidden="true">
            <GasPump weight="fill" />
          </span>
          <span className="cy-brand-word" aria-hidden="true" translate="no">
            {brandFirst} <span>{brandRest.join(" ")}</span>
          </span>
        </Link>
        <div className="cy-auth-panel-body">
          <p className="cy-auth-panel-title">{t("visualTitle")}</p>
          <ul className="cy-auth-benefits">
            {benefits.map(({ key, icon: BenefitIcon, live }) => (
              <li key={key}>
                <span className="cy-auth-benefit-icon" aria-hidden="true">
                  <BenefitIcon weight="bold" />
                </span>
                <span>{t(`benefits.${key}`)}</span>
                <span className={live ? "cy-tag cy-tag--live" : "cy-tag"}>
                  {landingT(live ? "liveTag" : "comingTag")}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <span className="cy-auth-wordmark" aria-hidden="true" translate="no">
          {common("brand")}
        </span>
      </aside>

      <section className="cy-auth-main" aria-labelledby="auth-title">
        <Link href="/" className="cy-auth-back">
          <ArrowLeft className="cy-flip" aria-hidden="true" weight="bold" />
          {t("backHome")}
        </Link>

        <div className="cy-auth-card">
          <nav className="cy-segmented" aria-label={t("modeLabel")}>
            <Link
              href="/auth/sign-in"
              aria-current={mode === "sign-in" ? "page" : undefined}
              className={mode === "sign-in" ? "is-selected" : ""}
            >
              {t("signIn")}
            </Link>
            <Link
              href="/auth/sign-up"
              aria-current={mode === "sign-up" ? "page" : undefined}
              className={mode === "sign-up" ? "is-selected" : ""}
            >
              {t("signUp")}
            </Link>
          </nav>

          <div className="cy-auth-heading">
            <div>
              <h1 id="auth-title">{title}</h1>
              <p>{t("subtitle")}</p>
            </div>
            <SpeakerButton text={`${title}. ${t("subtitle")}`} phraseId="auth-title" />
          </div>

          {mode === "sign-in" && <p className="cy-auth-note">{t("returnPrompt")}</p>}

          {!configured && (
            <p className="cy-auth-alert" role="status">{t("notConfigured")}</p>
          )}

          {!passwordMode && !codeSent && (
            <div className="cy-segmented cy-segmented--method" role="group" aria-label={t("methodLabel")}>
              <button type="button" aria-pressed={method === "phone"} onClick={() => {
                setMethod("phone");
                setCodeSent(false);
                setMessage("");
              }}>
                <DeviceMobile aria-hidden="true" weight="bold" /> {t("phone")}
              </button>
              <button type="button" aria-pressed={method === "email"} onClick={() => {
                setMethod("email");
                setCodeSent(false);
                setMessage("");
              }}>
                <EnvelopeSimple aria-hidden="true" weight="bold" /> {t("email")}
              </button>
            </div>
          )}

          {passwordMode && mode === "sign-in" ? (
            <form className="cy-auth-form" onSubmit={(event) => void signInWithPassword(event)}>
              <div className="cy-field">
                <label htmlFor="password-email">{t("emailLabel")}</label>
                <input
                  id="password-email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  type="email"
                  spellCheck={false}
                  placeholder={t("emailPlaceholder")}
                  required
                  value={identity}
                  onChange={(event) => setIdentity(event.currentTarget.value)}
                  disabled={!configured || busy}
                />
              </div>
              <div className="cy-field">
                <label htmlFor="password-value">{t("passwordLabel")}</label>
                <input
                  id="password-value"
                  name="password"
                  autoComplete="current-password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  disabled={!configured || busy}
                />
              </div>
              <button className="cy-button cy-button--accent cy-auth-submit" type="submit" disabled={!configured || busy}>
                {busy ? t("verifying") : t("signInWithPassword")}
              </button>
            </form>
          ) : !codeSent ? (
            <form className="cy-auth-form" onSubmit={(event) => void sendCode(event)}>
              <div className="cy-field">
                <label htmlFor="auth-identity">
                  {method === "phone" ? t("phoneLabel") : t("emailLabel")}
                </label>
                <input
                  id="auth-identity"
                  name={method === "phone" ? "phone" : "email"}
                  autoComplete={method === "phone" ? "tel" : "email"}
                  inputMode={method === "phone" ? "tel" : "email"}
                  type={method === "phone" ? "tel" : "email"}
                  spellCheck={false}
                  placeholder={method === "phone" ? t("phonePlaceholder") : t("emailPlaceholder")}
                  required
                  value={identity}
                  onChange={(event) => setIdentity(event.currentTarget.value)}
                  disabled={!configured || busy}
                />
              </div>
              <button className="cy-button cy-button--accent cy-auth-submit" type="submit" disabled={!configured || busy}>
                {busy ? t("sending") : t("sendCode")}
                {!busy && <ArrowRight className="cy-flip" aria-hidden="true" weight="bold" />}
              </button>
            </form>
          ) : (
            <form className="cy-auth-form" onSubmit={(event) => void verifyCode(event)}>
              <p className="cy-auth-note">{t("enterCode", { identity })}</p>
              <div className="cy-field">
                <label htmlFor="auth-code">{t("codeLabel")}</label>
                <input
                  id="auth-code"
                  name="code"
                  className="cy-code-input"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  type="text"
                  maxLength={8}
                  spellCheck={false}
                  required
                  value={code}
                  onChange={(event) => setCode(event.currentTarget.value.trim())}
                  disabled={busy}
                />
              </div>
              <button className="cy-button cy-button--accent cy-auth-submit" type="submit" disabled={busy}>
                {busy ? t("verifying") : t("verifyCode")}
              </button>
              <button
                className="cy-text-button"
                type="button"
                onClick={() => setCodeSent(false)}
                disabled={busy}
              >
                {t("changeIdentity")}
              </button>
            </form>
          )}

          {mode === "sign-in" && !codeSent && (
            <button
              className="cy-text-button"
              type="button"
              onClick={() => {
                setPasswordMode((current) => !current);
                setMethod("email");
                setCodeSent(false);
                setMessage("");
              }}
            >
              {passwordMode ? t("useOneTimeCode") : t("usePassword")}
            </button>
          )}

          {message && <p className="cy-auth-feedback" role="status" aria-live="polite">{message}</p>}

          <div className="cy-auth-footer">
            <Link href="/app/stations" className="cy-auth-guest">
              {t("continueAsGuest")}
              <ArrowRight className="cy-flip" aria-hidden="true" weight="bold" />
            </Link>
            <p className="cy-auth-terms">{t("terms")}</p>
          </div>
        </div>
        <span className="sr-only" lang={locale}>{t("title")}</span>
      </section>
    </main>
  );
}
