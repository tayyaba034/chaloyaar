import { describe, expect, it, vi } from "vitest";
import { speakWithFallback, type VoiceDependencies } from "./voice";

const voice = { lang: "en-US" } as SpeechSynthesisVoice;

function dependencies(overrides: Partial<VoiceDependencies> = {}): VoiceDependencies {
  return {
    playRecording: vi.fn(async () => false),
    requestCloudAudio: vi.fn(async () => false),
    getVoices: vi.fn(async () => [voice]),
    speakInBrowser: vi.fn(async () => undefined),
    unavailable: vi.fn(),
    ...overrides,
  };
}

describe("speakWithFallback", () => {
  it("uses fixed audio before cloud TTS and browser speech", async () => {
    const services = dependencies({
      playRecording: vi.fn(async () => true),
    });

    await expect(
      speakWithFallback("Hello", "hello", "en", services),
    ).resolves.toBe("recording");
    expect(services.requestCloudAudio).not.toHaveBeenCalled();
    expect(services.speakInBrowser).not.toHaveBeenCalled();
  });

  it("tries cloud TTS before browser speech", async () => {
    const services = dependencies({
      requestCloudAudio: vi.fn(async () => true),
    });

    await expect(
      speakWithFallback("Hello", "hello", "en", services),
    ).resolves.toBe("cloud");
    expect(services.speakInBrowser).not.toHaveBeenCalled();
  });

  it("reports unavailable when the device has no voice for the locale", async () => {
    const services = dependencies({ getVoices: vi.fn(async () => []) });

    await expect(
      speakWithFallback("سلام", "greeting", "ur", services),
    ).resolves.toBe("unavailable");
    expect(services.unavailable).toHaveBeenCalledOnce();
    expect(services.speakInBrowser).not.toHaveBeenCalled();
  });

  it("uses a matching browser voice as the final fallback", async () => {
    const services = dependencies();

    await expect(
      speakWithFallback("Hello", "hello", "en", services),
    ).resolves.toBe("browser");
    expect(services.speakInBrowser).toHaveBeenCalledWith("Hello", "en", voice);
  });
});
