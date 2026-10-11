"use client";

import { useCallback } from "react";
import { fixedPhraseRecordings } from "./voice-recordings";
import { speakWithFallback } from "./voice";
import { isAppLocale } from "@/i18n/routing";

export function useAppVoice() {
  return useCallback(async (text: string, phraseId: string, locale: string) => {
    if (!isAppLocale(locale)) throw new Error("Unsupported speech language.");
    const appLocale = locale;
    return speakWithFallback(text, phraseId, appLocale, {
      playRecording: async (id, language) => {
        const url = fixedPhraseRecordings[language]?.[id];
        if (!url) return false;
        const audio = new Audio(url);
        try {
          await audio.play();
          return true;
        } catch (error) {
          console.error("Fixed phrase audio could not be played", error);
          return false;
        }
      },
      requestCloudAudio: async (spokenText, language) => {
        if (process.env.NEXT_PUBLIC_CLOUD_TTS_ENABLED !== "true") return false;
        try {
          const response = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: spokenText, locale: language }),
          });
          if (response.status === 503) return false;
          if (!response.ok) {
            console.error("Cloud speech request failed", response.status);
            return false;
          }
          const audio = new Audio(URL.createObjectURL(await response.blob()));
          await audio.play();
          return true;
        } catch (error) {
          console.error("Cloud speech request failed", error);
          return false;
        }
      },
      getVoices: async () => {
        if (
          typeof window === "undefined" ||
          !("speechSynthesis" in window)
        ) return [];
        const synthesis = window.speechSynthesis;
        const available = synthesis.getVoices();
        if (available.length) return available;

        return new Promise<SpeechSynthesisVoice[]>((resolve) => {
          const timer = window.setTimeout(() => {
            synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
            resolve(synthesis.getVoices());
          }, 800);
          function handleVoicesChanged() {
            window.clearTimeout(timer);
            synthesis.removeEventListener("voiceschanged", handleVoicesChanged);
            resolve(synthesis.getVoices());
          }
          synthesis.addEventListener("voiceschanged", handleVoicesChanged, { once: true });
        });
      },
      speakInBrowser: (spokenText, _language, voice) =>
        new Promise<void>((resolve, reject) => {
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = voice.lang;
          utterance.voice = voice;
          const timeout = window.setTimeout(() => {
            window.speechSynthesis.cancel();
            reject(new Error("Speech playback timed out."));
          }, 20000);
          utterance.onend = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          utterance.onerror = (event) => {
            window.clearTimeout(timeout);
            reject(new Error(event.error));
          };
          window.speechSynthesis.speak(utterance);
        }),
      unavailable: () => undefined,
    });
  }, []);
}
