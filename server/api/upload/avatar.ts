import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import formidable, {
  type File as FormidableFile,
} from "formidable";

import fs from "node:fs/promises";

import { adminAuth } from "../../src/config/firebaseAdmin.js";
import cloudinary from "../../src/config/cloudinary.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_ORIGIN =
  process.env.CLIENT_ORIGIN ||
  "https://voxora-text-to-speech.vercel.app";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

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

function parseForm(
  req: VercelRequest
): Promise<{
  fields: formidable.Fields;
  files: formidable.Files;
}> {
  return new Promise(
    (resolve, reject) => {
      const form = formidable({
        multiples: false,
        maxFiles: 1,
        maxFileSize:
          MAX_FILE_SIZE,
        keepExtensions: true,
      });

      form.parse(
        req,
        (error, fields, files) => {
          if (error) {
            reject(error);
            return;
          }

          resolve({
            fields,
            files,
          });
        }
      );
    }
  );
}

function getUploadedFile(
  files: formidable.Files
): FormidableFile | null {
  const value =
    files.file;

  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value;
}

async function uploadToCloudinary(
  file: FormidableFile,
  uid: string
): Promise<{
  url: string;
  secureUrl: string;
  publicId: string;
}> {
  if (!file.filepath) {
    throw new Error(
      "Uploaded file path is missing."
    );
  }

  const buffer =
    await fs.readFile(
      file.filepath
    );

  return new Promise(
    (resolve, reject) => {
      const stream =
        cloudinary.uploader.upload_stream(
          {
            folder: `voxora/${uid}/avatars`,

            resource_type:
              "image",

            public_id:
              `avatar-${Date.now()}`,

            transformation: [
              {
                width: 512,
                height: 512,
                crop: "fill",
                gravity: "auto",
              },
            ],
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
              !result?.secure_url ||
              !result?.public_id
            ) {
              reject(
                new Error(
                  "Cloudinary did not return a valid result."
                )
              );

              return;
            }

            resolve({
              url:
                result.url,

              secureUrl:
                result.secure_url,

              publicId:
                result.public_id,
            });
          }
        );

      stream.end(buffer);
    }
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  setCors(res);

  /*
   * CORS preflight
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
      authorization.slice(
        7
      );

    const decoded =
      await adminAuth.verifyIdToken(
        token
      );

    /*
     * Parse multipart/form-data
     */
    let parsed;

    try {
      parsed =
        await parseForm(req);
    } catch (error: any) {
      console.error(
        "Multipart parsing error:",
        error
      );

      if (
        error?.code ===
        1009
      ) {
        return res
          .status(413)
          .json({
            success: false,
            error: {
              code:
                "FILE_TOO_LARGE",
              message:
                "Avatar must be 5MB or smaller.",
            },
          });
      }

      return res
        .status(400)
        .json({
          success: false,
          error: {
            code:
              "INVALID_UPLOAD",
            message:
              "Unable to read uploaded file.",
          },
        });
    }

    /*
     * Get file
     */
    const file =
      getUploadedFile(
        parsed.files
      );

    if (!file) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "FILE_REQUIRED",
          message:
            "Please choose an image.",
        },
      });
    }

    /*
     * Size check
     */
    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return res.status(413).json({
        success: false,
        error: {
          code:
            "FILE_TOO_LARGE",
          message:
            "Avatar must be 5MB or smaller.",
        },
      });
    }

    /*
     * MIME validation
     */
    if (
      !ALLOWED_MIME_TYPES.includes(
        file.mimetype ||
          ""
      )
    ) {
      return res.status(400).json({
        success: false,
        error: {
          code:
            "INVALID_FILE_TYPE",
          message:
            "Only JPG, PNG and WEBP images are allowed.",
        },
      });
    }

    /*
     * Upload to Cloudinary
     */
    const result =
      await uploadToCloudinary(
        file,
        decoded.uid
      );

    /*
     * Delete temporary upload
     */
    try {
      if (file.filepath) {
        await fs.rm(
          file.filepath,
          {
            force: true,
          }
        );
      }
    } catch (cleanupError) {
      console.warn(
        "Temporary file cleanup failed:",
        cleanupError
      );
    }

    /*
     * Success
     */
    return res.status(200).json({
      success: true,
      data: {
        url: result.url,
        secureUrl:
          result.secureUrl,
        publicId:
          result.publicId,
      },
    });
  } catch (error: any) {
    console.error(
      "Avatar upload error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: {
        code:
          "UPLOAD_FAILED",
        message:
          "Upload failed.",
      },
    });
  }
}
