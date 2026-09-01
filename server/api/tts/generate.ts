import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import { z } from "zod";

import { adminAuth } from "../../src/config/firebaseAdmin.js";

import {
  resolveVoice,
} from "../../src/services/providerRegistry.js";

import {
  chunkText,
} from "../../src/utils/chunkText.js";

import {
  mergeMp3,
  mp3ToWav,
  durationSeconds,
} from "../../src/utils/audio.js";

import cloudinary from "../../src/config/cloudinary.js";

const ALLOWED_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  "https://voxora-text-to-speech.vercel.app";

const MAX_TEXT_CHARS = Number(
  process.env.MAX_TEXT_CHARS ||
    20000
);

const schema = z.object({
  text: z.string().trim().min(1),

  voiceId: z.string().min(1),

  language: z.string().min(2),

  speed: z.coerce
    .number()
    .min(0.5)
    .max(2),

  pitch: z.coerce
    .number()
    .min(-50)
    .max(50),

  volume: z.coerce
    .number()
    .min(0)
    .max(1),

  format: z.enum([
    "mp3",
    "wav",
  ]),
});

/**
 * Set CORS headers.
 */
function setCors(
  res: VercelResponse
) {
  res.setHeader(
    "Access-Control-Allow-Origin",
    ALLOWED_ORIGIN
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
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
}

/**
 * Upload generated audio to Cloudinary.
 */
async function uploadAudio(
  buffer: Buffer,
  format: "mp3" | "wav",
  uid: string
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const stream =
        cloudinary.uploader.upload_stream(
          {
            resource_type: "raw",

            folder:
              `voxora/${uid}/audio`,

            public_id:
              `voice-${Date.now()}`,

            format,
          },

          (
            error,
            result
          ) => {
            if (error) {
              reject(error);
              return;
            }

            if (
              !result?.secure_url
            ) {
              reject(
                new Error(
                  "Cloudinary did not return a secure URL."
                )
              );

              return;
            }

            resolve(
              result.secure_url
            );
          }
        );

      stream.end(buffer);
    }
  );
}

/**
 * API handler.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  /*
   * CORS
   */
  setCors(res);

  /*
   * Preflight
   */
  if (
    req.method ===
    "OPTIONS"
  ) {
    return res
      .status(204)
      .end();
  }

  /*
   * Method
   */
  if (
    req.method !==
    "POST"
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
          code:
            "UNAUTHENTICATED",
          message:
            "Please sign in.",
        },
      });
    }

    const token =
      authorization.slice(7);

    let decoded;

    try {
      decoded =
        await adminAuth.verifyIdToken(
          token
        );
    } catch (error) {
      console.error(
        "Firebase token error:",
        error
      );

      return res.status(401).json({
        success: false,
        error: {
          code:
            "INVALID_TOKEN",
          message:
            "Your session is invalid or expired.",
        },
      });
    }

    /*
     * Validate body
     */
    const parsed =
      schema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      console.error(
        "TTS validation error:",
        parsed.error.flatten()
      );

      return res.status(400).json({
        success: false,
        error: {
          code:
            "INVALID_REQUEST",
          message:
            "Invalid TTS request.",
          details:
            parsed.error.flatten(),
        },
      });
    }

    const options =
      parsed.data;

    /*
     * Text length
     */
    if (
      options.text.length >
      MAX_TEXT_CHARS
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "TEXT_TOO_LONG",
          message:
            `Text is too long. Maximum ${MAX_TEXT_CHARS} characters.`,
        },
      });
    }

    /*
     * Get real voices
     */
    const resolved = await resolveVoice(options.voiceId);

    if (!resolved) {
      return res.status(400).json({
        success: false,
        error: {
          code: "VOICE_NOT_FOUND",
          message: "Voice is not available.",
        },
      });
    }

    const selectedVoice = resolved.voice;
    const selectedProvider = resolved.provider;

    /*
     * Split text
     */
    const chunks =
      chunkText(
        options.text,
        2800
      );

    if (
      chunks.length === 0
    ) {
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

    console.log(
      `[TTS] user=${decoded.uid}`
    );

    console.log(
      `[TTS] voice=${selectedVoice.id}`
    );

    console.log(
      `[TTS] language=${selectedVoice.locale}`
    );

    console.log(
      `[TTS] format=${options.format}`
    );

    console.log(
      `[TTS] chunks=${chunks.length}`
    );

    /*
     * Vercel limitation:
     *
     * For one MP3 chunk we can return
     * the provider output directly.
     *
     * Multiple chunks require FFmpeg.
     *
     * WAV also requires conversion.
     */
    if (
      chunks.length > 1
    ) {
      try {
        const buffers: Buffer[] =
          [];

        for (
          let i = 0;
          i < chunks.length;
          i++
        ) {
          console.log(
            `[TTS] generating chunk ${i + 1}/${chunks.length}`
          );

          const audio =
            await selectedProvider.generate(
              {
                ...options,

                text:
                  chunks[i],

                voiceId:
                  selectedVoice.id,

                language:
                  selectedVoice.locale,

                format: "mp3",
              }
            );

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
         * Merge using FFmpeg.
         */
        let output =
          await mergeMp3(
            buffers
          );

        /*
         * Convert WAV if requested.
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
         * Cloudinary
         */
        let audioUrl =
          "";

        if (
          (
            process.env
              .SAVE_AUDIO_TO_CLOUDINARY ||
            "false"
          ) === "true"
        ) {
          try {
            audioUrl =
              await uploadAudio(
                output,
                options.format,
                decoded.uid
              );
          } catch (
            uploadError
          ) {
            console.error(
              "Cloudinary audio upload failed:",
              uploadError
            );
          }
        }

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
          String(
            duration || 0
          )
        );

        res.setHeader(
          "X-Audio-Url",
          audioUrl
        );

        return res.send(
          output
        );
      } catch (error: any) {
        console.error(
          "Multi-chunk processing failed:",
          error
        );

        return res.status(502).json({
          success: false,
          error: {
            code:
              "AUDIO_PROCESSING_FAILED",
            message:
              error?.message ||
              "Unable to process generated audio. The deployment environment may not have FFmpeg available.",
          },
        });
      }
    }

    /*
     * Single chunk
     *
     * This path avoids FFmpeg.
     */
    console.log(
      "[TTS] generating single chunk"
    );

    let output: Buffer;

    try {
      output =
        await selectedProvider.generate(
          {
            ...options,

            text:
              chunks[0],

            voiceId:
              selectedVoice.id,

            language:
              selectedVoice.locale,

            /*
             * Always generate MP3
             * from the provider.
             */
            format: "mp3",
          }
        );
    } catch (error: any) {
      console.error(
        "TTS provider generation failed:",
        error
      );

      return res.status(502).json({
        success: false,
        error: {
          code:
            "TTS_PROVIDER_ERROR",
          message:
            error?.message ||
            "The TTS provider failed to generate audio.",
        },
      });
    }

    if (
      !output ||
      !output.length
    ) {
      return res.status(502).json({
        success: false,
        error: {
          code:
            "EMPTY_AUDIO",
          message:
            "The TTS provider returned an empty audio file.",
        },
      });
    }

    /*
     * WAV requires FFmpeg.
     */
    if (
      options.format ===
      "wav"
    ) {
      try {
        output =
          await mp3ToWav(
            output
          );
      } catch (error: any) {
        console.error(
          "WAV conversion failed:",
          error
        );

        return res.status(502).json({
          success: false,
          error: {
            code:
              "WAV_CONVERSION_FAILED",
            message:
              "WAV conversion requires FFmpeg on the server.",
          },
        });
      }
    }

    /*
     * Duration.
     *
     * Failure here must NOT
     * break the generated audio.
     */
    let duration = 0;

    try {
      duration =
        await durationSeconds(
          output,
          options.format
        );
    } catch (error) {
      console.warn(
        "Duration detection failed:",
        error
      );
    }

    /*
     * Upload audio to Cloudinary.
     */
    let audioUrl = "";

    if (
      (
        process.env
          .SAVE_AUDIO_TO_CLOUDINARY ||
        "false"
      ) === "true"
    ) {
      try {
        audioUrl =
          await uploadAudio(
            output,
            options.format,
            decoded.uid
          );
      } catch (
        uploadError
      ) {
        /*
         * Cloudinary failure must not
         * destroy generated audio.
         */
        console.error(
          "Cloudinary upload failed:",
          uploadError
        );
      }
    }

    /*
     * Response headers
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
      String(
        Number.isFinite(
          duration
        )
          ? duration
          : 0
      )
    );

    res.setHeader(
      "X-Audio-Url",
      audioUrl
    );

    /*
     * Success
     */
    console.log(
      `[TTS] success ${output.length} bytes`
    );

    return res.send(
      output
    );
  } catch (error: any) {
    console.error(
      "Unexpected Vercel TTS error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: {
        code:
          "INTERNAL_TTS_ERROR",
        message:
          "An unexpected error occurred while generating audio.",
      },
    });
  }
}
