export type VoiceGender = "Male" | "Female" | "Neutral";

export type Voice = {
  id: string;
  name: string;
  language: string;
  locale: string;
  gender: VoiceGender;
  provider: string;
  type: string;
  friendlyName?: string;
  isPopular?: boolean;
  providerVoiceId?: string;
  styles?: string[];
  categories?: string[];
  personalities?: string[];
};

export type TTSOptions = {
  text: string;
  voiceId: string;
  language: string;
  speed: number;
  pitch: number;
  volume: number;
  format: "mp3" | "wav";
};

export interface TTSProvider {
  getVoices(): Promise<Voice[]>;
  generate(options: TTSOptions): Promise<Buffer>;
  supports(language: string): boolean;
}
