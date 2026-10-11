"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAppVoice } from "./use-app-voice";
import type { AppLocale } from "@/i18n/routing";

export function SpeakerButton({
  text,
  phraseId,
  locale: localeOverride,
}: {
  text: string;
  phraseId: string;
  locale?: AppLocale;
}) {
  const t = useTranslations("voice");
  const activeLocale = useLocale();
  const locale = localeOverride ?? activeLocale;
  const speak = useAppVoice();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSpeak() {
    setBusy(true);
    setMessage("");
    try {
      const result = await speak(text, phraseId, locale);
      if (result === "unavailable") setMessage(t("unavailable"));
    } catch (error) {
      console.error("Speech playback failed", error);
      setMessage(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="speaker-wrap">
      <button
        className="speaker-button"
        type="button"
        aria-label={t("button")}
        title={t("button")}
        onClick={handleSpeak}
        disabled={busy}
      >
        <span aria-hidden="true">{busy ? "…" : "🔊"}</span>
      </button>
      <span className="voice-message" role="status" aria-live="polite">
        {message}
      </span>
    </span>
  );
}
