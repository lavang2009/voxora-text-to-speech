import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { env } from "./config/env.js";

import voiceRoutes from "./routes/voiceRoutes.js";
import ttsRoutes from "./routes/ttsRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";

import { errorHandler } from "./middleware/errorHandler.js";

const app = express();

/*
 * Security headers
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

/*
 * CORS
 */
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
    ],
  })
);

/*
 * JSON body
 */
app.use(
  express.json({
    limit: "1mb",
  })
);

/*
 * Rate limiting
 */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMITED",
      message:
        "Too many requests. Please try again later.",
    },
  },
});

app.use(limiter);

/*
 * Health check
 */
app.get(
  "/api/health",
  (_req, res) => {
    res.status(200).json({
      success: true,
      data: {
        status: "ok",
      },
    });
  }
);

/*
 * API routes
 */
app.use(
  "/api/voices",
  voiceRoutes
);

app.use(
  "/api/tts",
  ttsRoutes
);

app.use(
  "/api/upload",
  uploadRoutes
);

/*
 * 404 API handler
 */
app.use(
  "/api",
  (_req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message:
          "API endpoint not found.",
      },
    });
  }
);

/*
 * Global error handler
 */
app.use(errorHandler);

export default app;
