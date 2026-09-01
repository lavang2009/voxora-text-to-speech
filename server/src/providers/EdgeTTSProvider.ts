import {
  EdgeTTS,
  VoicesManager,
} from "edge-tts-universal";

import type {
  TTSOptions,
  TTSProvider,
  Voice,
} from "../types/index.js";

const POPULAR_VOICE_IDS = new Set([
  "vi-VN-HoaiMyNeural",
  "vi-VN-NamMinhNeural",
  "en-US-JennyNeural",
  "en-US-AriaNeural",
  "en-US-MichelleNeural",
  "en-US-GuyNeural",
  "en-US-DavisNeural",
  "en-US-AndrewNeural",
  "en-US-BrianNeural",
  "en-US-AvaNeural",
  "en-US-EmmaMultilingualNeural",
  "en-US-AndrewMultilingualNeural",
  "en-GB-SoniaNeural",
  "en-GB-RyanNeural",
  "en-GB-LibbyNeural",
  "en-GB-MaisieNeural",
  "ja-JP-NanamiNeural",
  "ja-JP-KeitaNeural",
  "ja-JP-AoiNeural",
  "ja-JP-DaichiNeural",
  "ko-KR-SunHiNeural",
  "ko-KR-InJoonNeural",
  "ko-KR-HyunsuNeural",
  "zh-CN-XiaoxiaoNeural",
  "zh-CN-XiaoyiNeural",
  "zh-CN-YunxiNeural",
  "zh-CN-YunyangNeural",
  "zh-CN-YunjianNeural",
  "fr-FR-DeniseNeural",
  "fr-FR-HenriNeural",
  "de-DE-KatjaNeural",
  "de-DE-ConradNeural",
  "es-ES-ElviraNeural",
  "es-ES-AlvaroNeural",
  "pt-BR-FranciscaNeural",
  "pt-BR-AntonioNeural",
  "it-IT-ElsaNeural",
  "it-IT-DiegoNeural",
  "hi-IN-SwaraNeural",
  "hi-IN-MadhurNeural",
  "id-ID-GadisNeural",
  "id-ID-ArdiNeural",
  "th-TH-PremwadeeNeural",
  "th-TH-NiwatNeural",
]);

const POPULAR_LOCALES = new Set([
  "vi-VN",
  "en-US",
  "en-GB",
  "en-AU",
  "en-CA",
  "en-IN",
  "zh-CN",
  "zh-TW",
  "ja-JP",
  "ko-KR",
  "es-ES",
  "es-MX",
  "fr-FR",
  "fr-CA",
  "de-DE",
  "pt-BR",
  "pt-PT",
  "it-IT",
  "hi-IN",
  "id-ID",
  "th-TH",
]);

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function shortDisplayName(friendlyName: string, shortName: string) {
  const withoutParentheses = friendlyName
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();

  return withoutParentheses || shortName;
}

export default class EdgeTTSProvider implements TTSProvider {
  private cache: Voice[] = [];
  private cacheTimestamp = 0;
  private loading?: Promise<Voice[]>;
  private readonly cacheDuration = 10 * 60 * 1000;

  supports(language: string): boolean {
    const normalized = language.toLowerCase();

    return this.cache.some((voice) =>
      voice.locale.toLowerCase() === normalized ||
      voice.language.toLowerCase() === normalized,
    );
  }

  async getVoices(): Promise<Voice[]> {
    const now = Date.now();

    if (
      this.cache.length > 0 &&
      now - this.cacheTimestamp < this.cacheDuration
    ) {
      return this.cache;
    }

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.refreshVoices();

    try {
      return await this.loading;
    } finally {
      this.loading = undefined;
    }
  }

  private async refreshVoices(): Promise<Voice[]> {
    console.log("[Edge TTS] Fetching all provider voices...");

    const manager = await VoicesManager.create();
    const providerVoices = manager.find({});

    console.log(
      `[Edge TTS] Provider returned ${providerVoices.length} voices`,
    );

    const unique = new Map<string, Voice>();

    for (const raw of providerVoices as any[]) {
      if (!raw?.ShortName || !raw?.Locale) continue;

      const id = String(raw.ShortName);
      const locale = String(raw.Locale);
      const friendlyName = String(raw.FriendlyName || raw.Name || id);

      const gender: Voice["gender"] =
        raw.Gender === "Male"
          ? "Male"
          : raw.Gender === "Female"
            ? "Female"
            : "Neutral";

      const styles = normalizeTags(raw.VoiceTag?.VoicePersonalities);
      const categories = normalizeTags(raw.VoiceTag?.ContentCategories);
      const isPopular =
        POPULAR_VOICE_IDS.has(id) || POPULAR_LOCALES.has(locale);

      if (!unique.has(id)) {
        unique.set(id, {
          id,
          providerVoiceId: id,
          name: shortDisplayName(friendlyName, id),
          language: locale.split("-")[0],
          locale,
          gender,
          provider: "Edge TTS",
          type: "neural",
          friendlyName,
          isPopular,
          styles,
          categories,
          personalities: styles,
        });
      }
    }

    this.cache = Array.from(unique.values()).sort((a, b) => {
      const aExact = POPULAR_VOICE_IDS.has(a.id);
      const bExact = POPULAR_VOICE_IDS.has(b.id);

      if (aExact !== bExact) return aExact ? -1 : 1;
      if (Boolean(a.isPopular) !== Boolean(b.isPopular)) {
        return a.isPopular ? -1 : 1;
      }
      if (a.locale === "vi-VN" && b.locale !== "vi-VN") return -1;
      if (b.locale === "vi-VN" && a.locale !== "vi-VN") return 1;
      if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
      if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
      return a.name.localeCompare(b.name);
    });

    this.cacheTimestamp = Date.now();

    const localeCounts = new Map<string, number>();
    for (const voice of this.cache) {
      localeCounts.set(voice.locale, (localeCounts.get(voice.locale) || 0) + 1);
    }

    console.log(`[Edge TTS] Cached ${this.cache.length} real voices`);
    console.log("[Edge TTS] Voice counts:", Object.fromEntries(localeCounts));

    return this.cache;
  }

  async generate(options: TTSOptions): Promise<Buffer> {
    const rateValue = Math.round((options.speed - 1) * 100);
    const rate = rateValue >= 0 ? `+${rateValue}%` : `${rateValue}%`;
    const pitch = options.pitch >= 0 ? `+${options.pitch}Hz` : `${options.pitch}Hz`;
    const volumeValue = Math.round((options.volume - 1) * 100);
    const volume = volumeValue >= 0 ? `+${volumeValue}%` : `${volumeValue}%`;

    const tts = new EdgeTTS(options.text, options.voiceId, {
      rate,
      pitch,
      volume,
    });

    const result = await tts.synthesize();

    if (!result?.audio) {
      throw new Error("Edge TTS returned no audio.");
    }

    const buffer = Buffer.from(await result.audio.arrayBuffer());

    if (!buffer.length) {
      throw new Error("Edge TTS returned an empty audio buffer.");
    }

    return buffer;
  }
}
