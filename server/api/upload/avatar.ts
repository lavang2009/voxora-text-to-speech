import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import { adminAuth } from "../../src/config/firebaseAdmin.js";
import cloudinary from "../../src/config/cloudinary.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

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
     * File parsing is deliberately
     * left out here because Vercel's
     * native request handling differs
     * from Express + multer.
     *
     * This endpoint should be upgraded
     * to a signed browser-to-Cloudinary
     * upload for production.
     */
    return res.status(501).json({
      success: false,
      error: {
        code:
          "UPLOAD_NOT_CONFIGURED",
        message:
          `Avatar upload is not configured yet for Vercel Functions (${decoded.uid}).`,
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
