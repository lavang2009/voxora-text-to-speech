import {
  EdgeTTS,
  listVoices,
} from "edge-tts-universal";

import type {
  TTSOptions,
  TTSProvider,
  Voice,
} from "../types/index.js";

export default class EdgeTTSProvider
  implements TTSProvider
{
  private cache: Voice[] = [];

  async getVoices(): Promise<Voice[]> {
    if (this.cache.length > 0) {
      return this.cache;
    }

    const voices = await listVoices();

    this.cache = voices.map((voice: any) => ({
      id: voice.ShortName,
      name: voice.FriendlyName || voice.ShortName,
      language: voice.Locale,
      locale: voice.Locale,
      gender:
        voice.Gender === "Male"
          ? "Male"
          : voice.Gender === "Female"
            ? "Female"
            : "Neutral",
      provider: "Edge TTS",
      type: "neural",
      friendlyName:
        voice.FriendlyName || voice.ShortName,
      isPopular: [
        "vi-VN",
        "en-US",
        "en-GB",
        "ja-JP",
        "ko-KR",
        "zh-CN",
      ].includes(voice.Locale),
    }));

    return this.cache;
  }

  supports(language: string): boolean {
    if (this.cache.length === 0) {
      return true;
    }

    return this.cache.some(
      (voice) =>
        voice.locale.toLowerCase() ===
        language.toLowerCase()
    );
  }

  async generate(
    options: TTSOptions
  ): Promise<Buffer> {
    console.log("=== EDGE TTS ===");
    console.log("Voice:", options.voiceId);
    console.log("Language:", options.language);
    console.log("Speed:", options.speed);
    console.log("Pitch:", options.pitch);
    console.log("Volume:", options.volume);
    console.log("Text:", options.text.slice(0, 100));

    /*
     * Edge TTS prosody values.
     *
     * Example:
     * speed 1.0 -> +0%
     * speed 1.2 -> +20%
     * speed 0.8 -> -20%
     */

    const ratePercent = Math.round(
      (options.speed - 1) * 100
    );

    const rate =
      ratePercent >= 0
        ? `+${ratePercent}%`
        : `${ratePercent}%`;

    const pitch =
      options.pitch >= 0
        ? `+${options.pitch}Hz`
        : `${options.pitch}Hz`;

    const volumePercent = Math.round(
      (options.volume - 1) * 100
    );

    const volume =
      volumePercent >= 0
        ? `+${volumePercent}%`
        : `${volumePercent}%`;

    console.log("Prosody:", {
      rate,
      pitch,
      volume,
    });

    try {
      const tts = new EdgeTTS(
        options.text,
        options.voiceId,
        {
          rate,
          pitch,
          volume,
        }
      );

      const result =
        await tts.synthesize();

      if (!result) {
        throw new Error(
          "Edge TTS returned an empty result."
        );
      }

      if (!result.audio) {
        throw new Error(
          "Edge TTS returned no audio."
        );
      }

      const arrayBuffer =
        await result.audio.arrayBuffer();

      const buffer = Buffer.from(
        arrayBuffer
      );

      if (buffer.length === 0) {
        throw new Error(
          "Edge TTS returned an empty audio buffer."
        );
      }

      console.log(
        `Audio generated successfully: ${buffer.length} bytes`
      );

      return buffer;
    } catch (error: any) {
      console.error(
        "EDGE TTS SYNTHESIS ERROR:"
      );

      console.error(error);

      throw new Error(
        error?.message ||
          "Edge TTS synthesis failed."
      );
    }
  }
}