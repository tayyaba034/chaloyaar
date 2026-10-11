"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { SpeakerButton } from "@/components/speaker-button";

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("states");
  useEffect(() => {
    console.error("Localized page failed to render", error);
  }, [error]);
  return (
    <main className="provider-pending-screen">
      <section className="notice-card" role="alert">
        <div className="dashboard-card-heading">
          <h1>{t("errorTitle")}</h1>
          <SpeakerButton text={`${t("errorTitle")}. ${t("errorMessage")}`} phraseId="page-error" />
        </div>
        <p>{t("errorMessage")}</p>
        <button className="auth-submit" type="button" onClick={() => reset()}>{t("retry")}</button>
      </section>
    </main>
  );
}
