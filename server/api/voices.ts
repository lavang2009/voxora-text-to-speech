import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getAllVoices } from "../src/services/providerRegistry.js";

const ALLOWED_ORIGIN = process.env.CLIENT_ORIGIN || "https://voxora-text-to-speech.vercel.app";

function cors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } });
  }

  try {
    const voices = await getAllVoices();
    const providers = [...new Set(voices.map((v) => v.provider))];
    const locales = [...new Set(voices.map((v) => v.locale))];

    return res.status(200).json({
      success: true,
      data: voices,
      meta: {
        total: voices.length,
        providers,
        locales,
      },
    });
  } catch (error) {
    console.error("Voice API error:", error);
    return res.status(503).json({
      success: false,
      error: {
        code: "VOICE_PROVIDER_UNAVAILABLE",
        message: "The voice providers are temporarily unavailable.",
      },
    });
  }
}
