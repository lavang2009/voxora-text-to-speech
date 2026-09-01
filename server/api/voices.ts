import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import {
  getAllVoices,
} from "../src/services/providerRegistry.js";

const ALLOWED_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  "https://voxora-text-to-speech.vercel.app";

function setCors(
  res: VercelResponse,
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN,
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, OPTIONS",
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true",
  );

  res.setHeader(
    "Vary",
    "Origin",
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  setCors(res);

  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  if (
    req.method !==
    "GET"
  ) {
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
      await getAllVoices();

    const providerCounts =
      new Map<
        string,
        number
      >();

    const localeCounts =
      new Map<
        string,
        number
      >();

    for (
      const voice of voices
    ) {
      providerCounts.set(
        voice.provider,
        (
          providerCounts.get(
            voice.provider,
          ) || 0
        ) + 1,
      );

      localeCounts.set(
        voice.locale,
        (
          localeCounts.get(
            voice.locale,
          ) || 0
        ) + 1,
      );
    }

    return res.status(200).json({
      success: true,
      data: voices,

      meta: {
        total:
          voices.length,

        providers:
          Array.from(
            providerCounts.entries(),
          ).map(
            ([provider, count]) => ({
              provider,
              count,
            }),
          ),

        locales:
          Array.from(
            localeCounts.entries(),
          ).map(
            ([locale, count]) => ({
              locale,
              count,
            }),
          ),
      },
    });
  } catch (error) {
    console.error(
      "Voice API error:",
      error,
    );

    return res.status(503).json({
      success: false,
      error: {
        code:
          "VOICE_PROVIDER_UNAVAILABLE",
        message:
          "The voice providers are temporarily unavailable.",
      },
    });
  }
}
