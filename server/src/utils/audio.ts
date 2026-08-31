import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Merge nhiều file MP3 thành một file MP3.
 *
 * FFmpeg phải được cài và có trong PATH.
 */
export async function mergeMp3(
  buffers: Buffer[]
): Promise<Buffer> {
  if (!buffers.length) {
    throw new Error("No audio buffers to merge.");
  }

  if (buffers.length === 1) {
    return buffers[0];
  }

  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "voxora-")
  );

  try {
    const files: string[] = [];

    for (let i = 0; i < buffers.length; i++) {
      const filePath = path.join(
        dir,
        `${i}.mp3`
      );

      await fs.writeFile(
        filePath,
        buffers[i]
      );

      files.push(filePath);
    }

    const listFile = path.join(
      dir,
      "list.txt"
    );

    const outputFile = path.join(
      dir,
      "out.mp3"
    );

    /*
     * FFmpeg concat demuxer.
     *
     * Resolve path dưới dạng absolute Windows path
     * nhưng thay "\" thành "/" để FFmpeg xử lý ổn định.
     */
    const listContent = files
      .map((file) => {
        const normalized = file
          .replace(/\\/g, "/")
          .replace(/'/g, "'\\''");

        return `file '${normalized}'`;
      })
      .join("\n");

    await fs.writeFile(
      listFile,
      listContent,
      "utf8"
    );

    await exec(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listFile,
        "-c",
        "copy",
        outputFile,
      ]
    );

    const output = await fs.readFile(
      outputFile
    );

    if (!output.length) {
      throw new Error(
        "FFmpeg produced an empty MP3 file."
      );
    }

    return output;
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Convert MP3 to WAV.
 *
 * FFmpeg phải được cài và có trong PATH.
 */
export async function mp3ToWav(
  buffer: Buffer
): Promise<Buffer> {
  if (!buffer.length) {
    throw new Error(
      "Cannot convert an empty audio buffer."
    );
  }

  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "voxora-wav-")
  );

  try {
    const inputFile = path.join(
      dir,
      "input.mp3"
    );

    const outputFile = path.join(
      dir,
      "output.wav"
    );

    await fs.writeFile(
      inputFile,
      buffer
    );

    await exec(
      "ffmpeg",
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
      ]
    );

    const output = await fs.readFile(
      outputFile
    );

    if (!output.length) {
      throw new Error(
        "FFmpeg produced an empty WAV file."
      );
    }

    return output;
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true,
    });
  }
}

/**
 * Get audio duration using ffprobe.
 *
 * IMPORTANT:
 * ffprobe là tùy chọn.
 * Nếu máy chưa cài ffprobe thì trả về 0 thay vì
 * làm thất bại toàn bộ quá trình Generate.
 */
export async function durationSeconds(
  buffer: Buffer,
  ext: string
): Promise<number> {
  if (!buffer.length) {
    return 0;
  }

  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "voxora-meta-")
  );

  try {
    const extension =
      ext.toLowerCase() === "wav"
        ? "wav"
        : "mp3";

    const filePath = path.join(
      dir,
      `audio.${extension}`
    );

    await fs.writeFile(
      filePath,
      buffer
    );

    try {
      const { stdout } =
        await exec(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            filePath,
          ]
        );

      const duration = Number(
        stdout.trim()
      );

      if (
        Number.isFinite(duration) &&
        duration >= 0
      ) {
        return duration;
      }

      return 0;
    } catch (error: any) {
      /*
       * Windows:
       * spawn ffprobe ENOENT
       *
       * Không được làm fail Generate.
       */
      if (error?.code === "ENOENT") {
        console.warn(
          "ffprobe was not found in PATH. Audio duration will be 0."
        );
      } else {
        console.warn(
          "Unable to detect audio duration:",
          error?.message || error
        );
      }

      return 0;
    }
  } finally {
    await fs.rm(dir, {
      recursive: true,
      force: true,
    });
  }
}