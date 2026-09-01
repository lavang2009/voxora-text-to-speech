import type { TTSOptions, TTSProvider, Voice } from "../types/index.js";

function joinUrl(base: string, path: string) {
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export default class PiperProvider implements TTSProvider {
  private readonly endpoint: string;
  private cache: Voice[] = [];
  private cacheTimestamp = 0;
  private loading?: Promise<Voice[]>;
  private readonly cacheDuration = 10 * 60 * 1000;

  constructor(endpoint = process.env.PIPER_URL || "") {
    this.endpoint = endpoint.trim().replace(/\/$/, "");
  }

  supports(language: string): boolean {
    const normalized = language.toLowerCase();
    return this.cache.some(
      (voice) =>
        voice.locale.toLowerCase() === normalized ||
        voice.language.toLowerCase() === normalized,
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

  private async refresh(): Promise<Voice[]> {
    const response = await fetch(joinUrl(this.endpoint, "/voices"), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Piper voice server returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as unknown;
    const rawVoices = Array.isArray(payload)
      ? payload
      : typeof payload === "object" && payload !== null && Array.isArray((payload as any).data)
        ? (payload as any).data
        : [];

    const result: Voice[] = rawVoices
      .filter((voice: any) => voice?.id && (voice?.locale || voice?.language))
      .map((voice: any): Voice => ({
        id: `piper:${String(voice.id)}`,
        providerVoiceId: String(voice.id),
        name: String(voice.name || voice.id),
        language: String(voice.language || String(voice.locale || "").split("-")[0]),
        locale: String(voice.locale || voice.language),
        gender:
          voice.gender === "Male" || voice.gender === "Female"
            ? voice.gender
            : "Neutral",
        provider: "Piper",
        type: String(voice.type || "open-source"),
        friendlyName: voice.friendlyName ? String(voice.friendlyName) : undefined,
        isPopular: Boolean(voice.isPopular),
        styles: Array.isArray(voice.styles) ? voice.styles : [],
        categories: Array.isArray(voice.categories) ? voice.categories : [],
      }));

    this.cache = result;
    this.cacheTimestamp = Date.now();
    console.log(`[Piper] Loaded ${result.length} voices from ${this.endpoint}`);
    return result;
  }

  async generate(options: TTSOptions): Promise<Buffer> {
    if (!this.endpoint) {
      throw new Error("Piper provider is not configured.");
    }

    const response = await fetch(joinUrl(this.endpoint, "/tts"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/wav, audio/mpeg, application/octet-stream",
      },
      body: JSON.stringify({
        text: options.text,
        voiceId: options.voiceId.replace(/^piper:/, ""),
        language: options.language,
        speed: options.speed,
        pitch: options.pitch,
        volume: options.volume,
        format: options.format,
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      throw new Error(
        `Piper TTS server returned HTTP ${response.status}${message ? `: ${message.slice(0, 200)}` : ""}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (!buffer.length) {
      throw new Error("Piper returned empty audio.");
    }

    return buffer;
  }
}
