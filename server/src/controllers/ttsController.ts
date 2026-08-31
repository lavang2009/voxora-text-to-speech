import type { Response } from "express";
import { z } from "zod";

import type { AuthedRequest } from "../middleware/auth.js";
import { provider } from "../services/providerRegistry.js";
import { chunkText } from "../utils/chunkText.js";
import {
  mergeMp3,
  mp3ToWav,
  durationSeconds,
} from "../utils/audio.js";
import cloudinary from "../config/cloudinary.js";

const schema = z.object({
  text: z.string().trim().min(1),
  voiceId: z.string().min(1),
  language: z.string().min(2),
  speed: z.coerce.number().min(0.5).max(2),
  pitch: z.coerce.number().min(-50).max(50),
  volume: z.coerce.number().min(0).max(1),
  format: z.enum(["mp3", "wav"]),
});

async function saveAudio(
  buffer: Buffer,
  format: string,
  uid: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: `voxora/${uid}/audio`,
        public_id: `voice-${Date.now()}`,
        format,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.secure_url) {
          reject(new Error("Cloudinary did not return a secure URL."));
          return;
        }

        resolve(result.secure_url);
      }
    );

    stream.end(buffer);
  });
}

export async function generate(
  req: AuthedRequest,
  res: Response
) {
  try {
    /*
     * 1. Validate request
     */
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      console.error(
        "TTS validation error:",
        parsed.error.flatten()
      );

      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid TTS request.",
          details: parsed.error.flatten(),
        },
      });
    }

    const options = parsed.data;

    /*
     * 2. Validate text length
     */
    const max = Number(
      process.env.MAX_TEXT_CHARS || 20000
    );

    if (options.text.length > max) {
      return res.status(400).json({
        success: false,
        error: {
          code: "TEXT_TOO_LONG",
          message: `Text is too long. Maximum ${max} characters.`,
        },
      });
    }

    /*
     * 3. Get provider voices
     */
    let voices;

    try {
      voices = await provider.getVoices();
    } catch (error) {
      console.error(
        "Voice provider list error:",
        error
      );

      return res.status(503).json({
        success: false,
        error: {
          code: "VOICE_PROVIDER_UNAVAILABLE",
          message:
            "The voice provider is temporarily unavailable.",
        },
      });
    }

    /*
     * 4. Find requested voice
     */
    const selectedVoice = voices.find(
      (voice) => voice.id === options.voiceId
    );

    if (!selectedVoice) {
      console.error(
        "Voice not found:",
        options.voiceId
      );

      return res.status(400).json({
        success: false,
        error: {
          code: "VOICE_NOT_FOUND",
          message:
            "Voice is not available. Please select another voice.",
        },
      });
    }

    /*
     * 5. Check language support
     */
    if (
      selectedVoice.locale &&
      options.language &&
      selectedVoice.locale.toLowerCase() !==
        options.language.toLowerCase()
    ) {
      console.warn(
        "Language mismatch:",
        selectedVoice.locale,
        options.language
      );
    }

    /*
     * 6. Split long text
     */
    const chunks = chunkText(
      options.text,
      2800
    );

    if (!chunks.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: "EMPTY_TEXT",
          message: "Text is empty.",
        },
      });
    }

    console.log(
      `Generating ${chunks.length} chunk(s) with voice ${selectedVoice.id}`
    );

    /*
     * 7. Generate every chunk
     */
    const buffers: Buffer[] = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(
        `Generating chunk ${i + 1}/${chunks.length}`
      );

      try {
        const buffer = await provider.generate({
          text: chunks[i],
          voiceId: selectedVoice.id,
          language: selectedVoice.locale,
          speed: options.speed,
          pitch: options.pitch,
          volume: options.volume,
          format: "mp3",
        });

        if (!buffer || !buffer.length) {
          throw new Error(
            "TTS provider returned empty audio."
          );
        }

        buffers.push(buffer);
      } catch (error: any) {
        console.error(
          `TTS chunk ${i + 1} failed:`,
          error
        );

        return res.status(502).json({
          success: false,
          error: {
            code: "TTS_PROVIDER_ERROR",
            message:
              "The TTS provider failed to generate audio.",
            details:
              process.env.NODE_ENV === "development"
                ? error?.message
                : undefined,
          },
        });
      }
    }

    /*
     * 8. Merge chunks
     */
    let output: Buffer;

    try {
      if (buffers.length === 1) {
        output = buffers[0];
      } else {
        output = await mergeMp3(buffers);
      }
    } catch (error: any) {
      console.error(
        "Audio merge error:",
        error
      );

      return res.status(500).json({
        success: false,
        error: {
          code: "AUDIO_MERGE_FAILED",
          message:
            "Unable to merge generated audio.",
          details:
            process.env.NODE_ENV === "development"
              ? error?.message
              : undefined,
        },
      });
    }

    /*
     * 9. Convert MP3 -> WAV when requested
     */
    if (options.format === "wav") {
      try {
        output = await mp3ToWav(output);
      } catch (error: any) {
        console.error(
          "WAV conversion error:",
          error
        );

        return res.status(500).json({
          success: false,
          error: {
            code: "WAV_CONVERSION_FAILED",
            message:
              "Unable to create WAV audio.",
            details:
              process.env.NODE_ENV === "development"
                ? error?.message
                : undefined,
          },
        });
      }
    }

    /*
     * 10. Calculate duration
     */
    const duration = await durationSeconds(
      output,
      options.format
    );

    /*
     * 11. Optional Cloudinary storage
     */
    let audioUrl = "";

    if (
      (process.env.SAVE_AUDIO_TO_CLOUDINARY ||
        "false") === "true"
    ) {
      try {
        audioUrl = await saveAudio(
          output,
          options.format,
          req.uid!
        );
      } catch (error) {
        console.error(
          "Cloudinary audio upload failed:",
          error
        );

        // Do not fail the generation itself.
        audioUrl = "";
      }
    }

    /*
     * 12. Return real audio file
     */
    res.setHeader(
      "Content-Type",
      options.format === "wav"
        ? "audio/wav"
        : "audio/mpeg"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="voice-${Date.now()}.${options.format}"`
    );

    res.setHeader(
      "X-Audio-Url",
      audioUrl
    );

    res.setHeader(
      "X-Audio-Duration",
      String(duration)
    );

    console.log(
      `TTS success: ${options.format}, ${duration}s`
    );

    return res.send(output);
  } catch (error: any) {
    console.error(
      "Unexpected TTS error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_TTS_ERROR",
        message:
          "An unexpected error occurred while generating audio.",
        details:
          process.env.NODE_ENV === "development"
            ? error?.message
            : undefined,
      },
    });
  }
}
