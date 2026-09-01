import "dotenv/config";
import { z } from "zod";

export const env = z
  .object({
    PORT: z.coerce.number().default(5000),
    CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().email(),
    FIREBASE_PRIVATE_KEY: z.string().min(20),
    CLOUDINARY_CLOUD_NAME: z.string().min(1),
    CLOUDINARY_API_KEY: z.string().min(1),
    CLOUDINARY_API_SECRET: z.string().min(1),
    MAX_TEXT_CHARS: z.coerce.number().default(20000),
    PIPER_URL: z.string().url().optional(),
  })
  .parse(process.env);
