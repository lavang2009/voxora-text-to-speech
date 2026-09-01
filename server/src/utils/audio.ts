import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import ffprobePackage from "@derhuerst/ffprobe-static";

const exec = promisify(execFile);

/*
 * Static binaries bundled through npm.
 *
 * Local Windows:
 *   ffmpeg.exe / ffprobe.exe
 *
 * Vercel Linux:
 *   Linux binary from the package
 */
const FFMPEG_PATH =
  ffmpegPath || "ffmpeg";

const FFPROBE_PATH =
  ffprobePackage.path || "ffprobe";

function ensureBinary(
  value: string | null | undefined,
  name: string
): string {
  if (!value) {
    throw new Error(
      `${name} binary is not available.`
    );
  }

  return value;
}

/**
 * Merge MP3 buffers into one MP3.
 */
export async function mergeMp3(
  buffers: Buffer[]
): Promise<Buffer> {
  if (!buffers.length) {
    throw new Error(
      "No audio buffers to merge."
    );
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  const dir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "voxora-"
      )
    );

  try {
    const files: string[] = [];

    for (
      let i = 0;
      i < buffers.length;
      i++
    ) {
      const filePath =
        path.join(
          dir,
          `${i}.mp3`
        );

      await fs.writeFile(
        filePath,
        buffers[i]
      );

      files.push(filePath);
    }

    const listFile =
      path.join(
        dir,
        "list.txt"
      );

    const outputFile =
      path.join(
        dir,
        "merged.mp3"
      );

    const listContent =
      files
        .map((file) => {
          const normalized =
            file
              .replace(
                /\\/g,
                "/"
              )
              .replace(
                /'/g,
                "'\\''"
              );

          return `file '${normalized}'`;
        })
        .join("\n");

    await fs.writeFile(
      listFile,
      listContent,
      "utf8"
    );

    const executable =
      ensureBinary(
        FFMPEG_PATH,
        "FFmpeg"
      );

    await exec(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",

        "-f",
        "concat",

        "-safe",
        "0",

        "-i",
        listFile,

        "-c",
        "copy",

        outputFile,
      ],
      {
        maxBuffer:
          1024 * 1024 * 10,
      }
    );

    const output =
      await fs.readFile(
        outputFile
      );

    if (!output.length) {
      throw new Error(
        "FFmpeg produced an empty MP3 file."
      );
    }

    return output;
  } finally {
    await fs.rm(
      dir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/**
 * Convert MP3 to WAV.
 */
export async function mp3ToWav(
  buffer: Buffer
): Promise<Buffer> {
  if (!buffer.length) {
    throw new Error(
      "Cannot convert empty audio."
    );
  }

  const dir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "voxora-wav-"
      )
    );

  try {
    const inputFile =
      path.join(
        dir,
        "input.mp3"
      );

    const outputFile =
      path.join(
        dir,
        "output.wav"
      );

    await fs.writeFile(
      inputFile,
      buffer
    );

    const executable =
      ensureBinary(
        FFMPEG_PATH,
        "FFmpeg"
      );

    await exec(
      executable,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",

        "-i",
        inputFile,

        "-ar",
        "44100",

        "-ac",
        "2",

        outputFile,
      ],
      {
        maxBuffer:
          1024 * 1024 * 10,
      }
    );

    const output =
      await fs.readFile(
        outputFile
      );

    if (!output.length) {
      throw new Error(
        "FFmpeg produced an empty WAV file."
      );
    }

    return output;
  } finally {
    await fs.rm(
      dir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}

/**
 * Get audio duration.
 *
 * If ffprobe is unavailable,
 * return 0 instead of breaking TTS.
 */
export async function durationSeconds(
  buffer: Buffer,
  extension: string
): Promise<number> {
  if (!buffer.length) {
    return 0;
  }

  const dir =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "voxora-meta-"
      )
    );

  try {
    const ext =
      extension.toLowerCase() ===
      "wav"
        ? "wav"
        : "mp3";

    const filePath =
      path.join(
        dir,
        `audio.${ext}`
      );

    await fs.writeFile(
      filePath,
      buffer
    );

    try {
      const executable =
        ensureBinary(
          FFPROBE_PATH,
          "FFprobe"
        );

      const {
        stdout,
      } = await exec(
        executable,
        [
          "-v",
          "error",

          "-show_entries",
          "format=duration",

          "-of",
          "default=noprint_wrappers=1:nokey=1",

          filePath,
        ],
        {
          maxBuffer:
            1024 * 1024,
        }
      );

      const duration =
        Number(
          stdout.trim()
        );

      if (
        Number.isFinite(
          duration
        ) &&
        duration >= 0
      ) {
        return duration;
      }

      return 0;
    } catch (
      probeError
    ) {
      console.warn(
        "FFprobe failed. Duration set to 0.",
        probeError
      );

      return 0;
    }
  } finally {
    await fs.rm(
      dir,
      {
        recursive: true,
        force: true,
      }
    );
  }
}
