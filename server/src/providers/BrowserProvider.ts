import type {
  TTSOptions,
  TTSProvider,
  Voice,
} from "../types/index.js";

export default class BrowserProvider
  implements TTSProvider
{
  supports(_language: string): boolean {
    return false;
  }

  async getVoices(): Promise<Voice[]> {
    return [];
  }

  async generate(
    _options: TTSOptions
  ): Promise<Buffer> {
    throw new Error(
      "Browser TTS is preview-only and cannot render server audio."
    );
  }
}
