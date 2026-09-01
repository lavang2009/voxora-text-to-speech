import type {
  Request,
  Response,
} from "express";

import {
  getAllVoices,
} from "../services/providerRegistry.js";

export async function listVoices(
  _req: Request,
  res: Response,
) {
  try {
    const voices =
      await getAllVoices();

    return res.json({
      success: true,
      data: voices,
      meta: {
        total:
          voices.length,
      },
    });
  } catch (error) {
    console.error(
      "Voice discovery failed:",
      error,
    );

    return res.status(503).json({
      success: false,
      error: {
        code:
          "VOICE_UNAVAILABLE",
        message:
          "Voice providers are temporarily unavailable.",
      },
    });
  }
}
