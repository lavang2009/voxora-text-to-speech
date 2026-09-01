import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "@derhuerst/ffprobe-static";

const exec = promisify(execFile);

/*
 * ffmpeg-static có thể export kiểu:
 * string | null
 */
const FFMPEG_PATH =
  typeof ffmpegStatic === "string"
    ? ffmpegStatic
    : null;

/*
 * @derhuerst/ffprobe-static export object
 * chứa đường dẫn binary.
 */
const FFPROBE_PATH =
  typeof ffprobeStatic === "object" &&
  ffprobeStatic !== null &&
  "path" in ffprobeStatic &&
  typeof ffprobeStatic.path === "string"
    ? ffprobeStatic.path
    : null;

function requireBinary(
  value: string | null,
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
 * Merge multiple MP3 buffers.
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
      requireBinary(
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
          10 * 1024 * 1024,
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
      requireBinary(
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
          10 * 1024 * 1024,
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
 * Detect duration with ffprobe.
 *
 * If ffprobe is unavailable,
 * return 0 without failing TTS.
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
        requireBinary(
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
    } catch (error: any) {
      console.warn(
        "Unable to detect duration with ffprobe:",
        error?.message || error
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
