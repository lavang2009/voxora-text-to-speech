import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import { z } from "zod";

import { adminAuth } from "../../src/config/firebaseAdmin.js";
import { provider } from "../../src/services/providerRegistry.js";

import { chunkText } from "../../src/utils/chunkText.js";
import {
  mergeMp3,
  mp3ToWav,
  durationSeconds,
} from "../../src/utils/audio.js";

const schema = z.object({
  text: z.string().trim().min(1),
  voiceId: z.string().min(1),
  language: z.string().min(2),
  speed: z.coerce.number().min(0.5).max(2),
  pitch: z.coerce.number().min(-50).max(50),
  volume: z.coerce.number().min(0).max(1),
  format: z.enum(["mp3", "wav"]),
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: {
        code: "METHOD_NOT_ALLOWED",
        message:
          "Method not allowed.",
      },
    });
  }

  try {
    /*
     * Firebase authentication
     */
    const authorization =
      req.headers.authorization;

    if (
      !authorization ||
      !authorization.startsWith(
        "Bearer "
      )
    ) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHENTICATED",
          message:
            "Please sign in.",
        },
      });
    }

    const token =
      authorization.substring(
        7
      );

    const decoded =
      await adminAuth.verifyIdToken(
        token
      );

    /*
     * Validate request
     */
    const parsed =
      schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "INVALID_REQUEST",
          message:
            "Invalid TTS request.",
        },
      });
    }

    const options =
      parsed.data;

    const max =
      Number(
        process.env.MAX_TEXT_CHARS ||
          20000
      );

    if (
      options.text.length >
      max
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "TEXT_TOO_LONG",
          message:
            `Text is too long. Maximum ${max} characters.`,
        },
      });
    }

    /*
     * Get voices
     */
    const voices =
      await provider.getVoices();

    const selectedVoice =
      voices.find(
        (voice) =>
          voice.id ===
          options.voiceId
      );

    if (!selectedVoice) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "VOICE_NOT_FOUND",
          message:
            "Voice is not available.",
        },
      });
    }

    /*
     * Split long text
     */
    const chunks =
      chunkText(
        options.text,
        2800
      );

    if (!chunks.length) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "EMPTY_TEXT",
          message:
            "Text is empty.",
        },
      });
    }

    /*
     * Generate audio
     */
    const buffers: Buffer[] =
      [];

    for (
      let i = 0;
      i < chunks.length;
      i++
    ) {
      console.log(
        `Generating chunk ${i + 1}/${chunks.length}`
      );

      const audio =
        await provider.generate({
          ...options,
          text: chunks[i],
          voiceId:
            selectedVoice.id,
          language:
            selectedVoice.locale,

          /*
           * Generate MP3 first.
           * WAV conversion happens after merge.
           */
          format: "mp3",
        });

      if (
        !audio ||
        !audio.length
      ) {
        throw new Error(
          "TTS provider returned empty audio."
        );
      }

      buffers.push(audio);
    }

    /*
     * Merge
     */
    let output: Buffer;

    if (
      buffers.length === 1
    ) {
      output = buffers[0];
    } else {
      output =
        await mergeMp3(
          buffers
        );
    }

    /*
     * WAV
     */
    if (
      options.format ===
      "wav"
    ) {
      output =
        await mp3ToWav(
          output
        );
    }

    /*
     * Duration
     */
    const duration =
      await durationSeconds(
        output,
        options.format
      );

    /*
     * Return file
     */
    res.setHeader(
      "Content-Type",
      options.format ===
        "wav"
        ? "audio/wav"
        : "audio/mpeg"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="voice-${Date.now()}.${options.format}"`
    );

    res.setHeader(
      "X-Audio-Duration",
      String(duration)
    );

    res.setHeader(
      "X-Audio-Url",
      ""
    );

    console.log(
      `TTS success for ${decoded.uid}: ${options.format}, ${output.length} bytes`
    );

    return res.send(
      output
    );
  } catch (error: any) {
    console.error(
      "Vercel TTS error:",
      error
    );

    return res.status(502).json({
      success: false,
      error: {
        code:
          "TTS_PROVIDER_ERROR",
        message:
          error?.message ||
          "Unable to generate audio.",
      },
    });
  }
}
