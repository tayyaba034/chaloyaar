import type { AppLocale } from "@/i18n/routing";

export type VoiceResult = "recording" | "cloud" | "browser" | "unavailable";

export interface VoiceDependencies {
  playRecording: (phraseId: string, locale: AppLocale) => Promise<boolean>;
  requestCloudAudio: (text: string, locale: AppLocale) => Promise<boolean>;
  getVoices: () => Promise<SpeechSynthesisVoice[]>;
  speakInBrowser: (text: string, locale: AppLocale, voice: SpeechSynthesisVoice) => Promise<void>;
  unavailable: () => void;
}

function findVoice(voices: SpeechSynthesisVoice[], locale: AppLocale) {
  const language = locale.split("-")[0].toLowerCase();
  return voices.find((voice) => voice.lang.toLowerCase().split("-")[0] === language);
}

export async function speakWithFallback(
  text: string,
  phraseId: string,
  locale: AppLocale,
  dependencies: VoiceDependencies,
): Promise<VoiceResult> {
  if (await dependencies.playRecording(phraseId, locale)) return "recording";
  if (await dependencies.requestCloudAudio(text, locale)) return "cloud";

  const voice = findVoice(await dependencies.getVoices(), locale);
  if (!voice) {
    dependencies.unavailable();
    return "unavailable";
  }

  await dependencies.speakInBrowser(text, locale, voice);
  return "browser";
}
