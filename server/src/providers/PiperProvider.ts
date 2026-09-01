import type { TTSOptions, TTSProvider, Voice } from "../types/index.js";

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getConfiguredToken(): string {
  return (process.env.PIPER_AUTH_TOKEN || "").trim();
}

type PiperRawVoice = {
  id: string;
  name?: string;
  language?: string;
  locale?: string;
  gender?: string;
  type?: string;
  isPopular?: boolean;
  speakerId?: number;
  speakerName?: string;
  numSpeakers?: number;
  quality?: string;
  modelId?: string;
};

export default class PiperProvider implements TTSProvider {
  private readonly endpoint: string;
  private readonly authToken: string;
  private cache: Voice[] = [];
  private cacheTimestamp = 0;
  private loading?: Promise<Voice[]>;
  private readonly cacheDuration: number;

  constructor(
    endpoint = process.env.PIPER_URL || "",
    authToken = process.env.PIPER_AUTH_TOKEN || "",
  ) {
    this.endpoint = endpoint.trim().replace(/\/$/, "");
    this.authToken = authToken.trim();
    this.cacheDuration = Number(
      process.env.PIPER_VOICE_CACHE_MS || 15 * 60 * 1000,
    );
  }

  supports(language: string): boolean {
    const normalized = language.toLowerCase();

    return this.cache.some(
      (voice) =>
        voice.locale.toLowerCase() === normalized ||
        voice.language.toLowerCase() === normalized ||
        voice.language.toLowerCase().startsWith(`${normalized}-`),
    );
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.endpoint) return [];

    const now = Date.now();

    if (
      this.cache.length > 0 &&
      now - this.cacheTimestamp < this.cacheDuration
    ) {
      return this.cache;
    }

    if (this.loading) return this.loading;

    this.loading = this.refresh();

    try {
      return await this.loading;
    } finally {
      this.loading = undefined;
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }

    return headers;
  }

  private async refresh(): Promise<Voice[]> {
    const response = await fetch(
      joinUrl(this.endpoint, "/voices"),
      {
        method: "GET",
        headers: this.headers(),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Piper voice server returned HTTP ${response.status}.`,
      );
    }

    const payload = (await response.json()) as unknown;

    const rawVoices: PiperRawVoice[] = Array.isArray(payload)
      ? (payload as PiperRawVoice[])
      : typeof payload === "object" &&
          payload !== null &&
          Array.isArray((payload as any).data)
        ? ((payload as any).data as PiperRawVoice[])
        : [];

    const result: Voice[] = rawVoices
      .filter(
        (voice) =>
          Boolean(voice?.id) &&
          Boolean(voice?.locale || voice?.language),
      )
      .map(
        (voice): Voice => ({
          id: `piper:${String(voice.id)}`,
          providerVoiceId: String(voice.id),
          name: String(
            voice.name ||
              voice.speakerName ||
              voice.id,
          ),
          language: String(
            voice.language ||
              String(voice.locale || "").split("-")[0],
          ),
          locale: String(
            voice.locale ||
              voice.language ||
              "",
          ).replace("_", "-"),
          gender:
            voice.gender === "Male" ||
            voice.gender === "Female"
              ? voice.gender
              : "Neutral",
          provider: "Piper",
          type: String(
            voice.type ||
              `piper-${voice.quality || "voice"}`,
          ),
          friendlyName: voice.speakerName
            ? String(voice.speakerName)
            : undefined,
          isPopular: Boolean(
            voice.isPopular,
          ),
        }),
      );

    const unique = new Map<string, Voice>();

    for (const voice of result) {
      if (!unique.has(voice.id)) {
        unique.set(
          voice.id,
          voice,
        );
      }
    }

    this.cache = Array.from(
      unique.values(),
    ).sort((a, b) => {
      if (
        Boolean(a.isPopular) !==
        Boolean(b.isPopular)
      ) {
        return a.isPopular ? -1 : 1;
      }

      if (a.locale !== b.locale) {
        return a.locale.localeCompare(
          b.locale,
        );
      }

      if (a.name !== b.name) {
        return a.name.localeCompare(
          b.name,
        );
      }

      return a.id.localeCompare(
        b.id,
      );
    });

    this.cacheTimestamp =
      Date.now();

    console.log(
      `[Piper] Loaded ${this.cache.length} catalog voices from ${this.endpoint}`,
    );

    return this.cache;
  }

  async generate(
    options: TTSOptions,
  ): Promise<Buffer> {
    if (!this.endpoint) {
      throw new Error(
        "Piper provider is not configured.",
      );
    }

    const rawId =
      options.voiceId.replace(
        /^piper:/,
        "",
      );

    const response =
      await fetch(
        joinUrl(
          this.endpoint,
          "/tts",
        ),
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
            Accept:
              "audio/wav, audio/mpeg, application/octet-stream",
            ...(this.authToken
              ? {
                  Authorization:
                    `Bearer ${this.authToken}`,
                }
              : {}),
          },
          body: JSON.stringify({
            text: options.text,
            voiceId: rawId,
            language: options.language,
            speed: options.speed,
            pitch: options.pitch,
            volume: options.volume,
            format: options.format,
          }),
          signal:
            AbortSignal.timeout(
              180_000,
            ),
        },
      );

    if (!response.ok) {
      const message =
        await response
          .text()
          .catch(() => "");

      throw new Error(
        `Piper TTS server returned HTTP ${response.status}${
          message
            ? `: ${message.slice(0, 300)}`
            : ""
        }`,
      );
    }

    const arrayBuffer =
      await response.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer,
      );

    if (!buffer.length) {
      throw new Error(
        "Piper returned empty audio.",
      );
    }

    return buffer;
  }
}
