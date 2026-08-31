import type {
  TTSOptions,
  TTSProvider,
  Voice,
} from "../types/index.js";

export default class PiperProvider
  implements TTSProvider
{
  private readonly endpoint: string;

  constructor(
    endpoint =
      process.env.PIPER_URL || ""
  ) {
    this.endpoint = endpoint;
  }

  supports(_language: string): boolean {
    return Boolean(this.endpoint);
  }

  async getVoices(): Promise<Voice[]> {
    return [];
  }

  async generate(
    _options: TTSOptions
  ): Promise<Buffer> {
    throw new Error(
      "Piper provider is not configured."
    );
  }
}
