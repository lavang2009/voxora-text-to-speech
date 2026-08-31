import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import {
  provider,
} from "../src/services/providerRegistry.js";

const ALLOWED_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  "https://voxora-text-to-speech.vercel.app";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  /*
   * CORS
   */
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.setHeader(
    "Vary",
    "Origin"
  );

  /*
   * Preflight
   */
  if (req.method === "OPTIONS") {
    return res
      .status(204)
      .end();
  }

  /*
   * Method
   */
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: {
        code:
          "METHOD_NOT_ALLOWED",
        message:
          "Method not allowed.",
      },
    });
  }

  try {
    const voices =
      await provider.getVoices();

    return res.status(200).json({
      success: true,
      data: Array.isArray(voices)
        ? voices
        : [],
    });
  } catch (error) {
    console.error(
      "Voice API error:",
      error
    );

    return res.status(503).json({
      success: false,
      error: {
        code:
          "VOICE_PROVIDER_UNAVAILABLE",
        message:
          "The voice provider is temporarily unavailable.",
      },
    });
  }
}
