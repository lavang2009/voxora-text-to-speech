```ts
import type {
  VercelRequest,
  VercelResponse,
} from "@vercel/node";

import { provider } from "../src/services/providerRegistry.js";

export default async function handler(
  _req: VercelRequest,
  res: VercelResponse
) {
  try {
    const voices =
      await provider.getVoices();

    return res.status(200).json({
      success: true,
      data: voices,
    });
  } catch (error) {
    console.error(
      "Voice API error:",
      error
    );

    return res.status(503).json({
      success: false,
      error: {
        code:
          "VOICE_PROVIDER_UNAVAILABLE",
        message:
          "The voice provider is temporarily unavailable.",
      },
    });
  }
}
```
