import type { TTSProvider, Voice } from "../types/index.js";
import EdgeTTSProvider from "../providers/EdgeTTSProvider.js";
import PiperProvider from "../providers/PiperProvider.js";

export const edgeProvider = new EdgeTTSProvider();
export const piperProvider = new PiperProvider();

export const providers: TTSProvider[] = [edgeProvider, piperProvider];

let cache: Voice[] = [];
let cacheTimestamp = 0;
let loading: Promise<Voice[]> | undefined;
const CACHE_MS = 10 * 60 * 1000;

export async function getAllVoices(): Promise<Voice[]> {
  const now = Date.now();
  if (cache.length > 0 && now - cacheTimestamp < CACHE_MS) return cache;
  if (loading) return loading;

  loading = (async () => {
    const results = await Promise.allSettled(
      providers.map((p) => p.getVoices()),
    );

    const all: Voice[] = [];
    for (const result of results) {
      if (result.status === "fulfilled") all.push(...result.value);
      else console.warn("TTS provider voice discovery failed:", result.reason);
    }

    const unique = new Map<string, Voice>();
    for (const voice of all) {
      const key = `${voice.provider}:${voice.id}`;
      if (!unique.has(key)) unique.set(key, voice);
    }

    cache = Array.from(unique.values()).sort((a, b) => {
      if (Boolean(a.isPopular) !== Boolean(b.isPopular)) return a.isPopular ? -1 : 1;
      if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
      if (a.gender !== b.gender) return a.gender.localeCompare(b.gender);
      return a.name.localeCompare(b.name);
    });

    cacheTimestamp = Date.now();
    console.log(`[Voice Registry] Aggregated ${cache.length} voices.`);
    return cache;
  })();

  try {
    return await loading;
  } finally {
    loading = undefined;
  }
}

export async function resolveVoice(voiceId: string): Promise<{
  provider: TTSProvider;
  voice: Voice;
} | null> {
  const voices = await getAllVoices();
  const voice = voices.find((item) => item.id === voiceId);
  if (!voice) return null;

  if (voice.provider === "Edge TTS") {
    return { provider: edgeProvider, voice };
  }

  if (voice.provider === "Piper") {
    return { provider: piperProvider, voice };
  }

  return null;
}

// Backward compatibility for existing Express code.
export const provider = edgeProvider;
