# Voxora Piper Voice Aggregator

This add-on integrates the official OHF-Voice `piper1-gpl` HTTP-compatible engine as a separate self-hosted service.

## What this changes

The Node/Vercel backend aggregates:

- Edge TTS voices
- Piper voices

The Piper service exposes the complete Piper voice catalog from the official `rhasspy/piper-voices` repository. Models are downloaded on demand the first time a voice is synthesized.

The current Piper catalog is documented as covering 35 languages. The official Piper HTTP API exposes `/voices`, `/all-voices` and `/synthesize`; this service keeps the same general model but adds a `/tts` JSON endpoint for Voxora, dynamic model download, multi-speaker expansion, and MP3 conversion.

## Architecture

Frontend
  -> Voxora Vercel API
      -> Edge TTS
      -> Piper HTTP service
          -> Piper model catalog
          -> on-demand model download
          -> real WAV/MP3 synthesis

## Start Piper locally

Requirements:

- Docker Desktop

From the `server` directory:

```powershell
docker compose -f docker-compose.piper.yml up --build
```

Piper will listen on:

```text
http://localhost:5100
```

Test:

```text
http://localhost:5100/health
```

Then:

```text
http://localhost:5100/voices
```

The first `/voices` request fetches the current official catalog. It does not download every model.

## Connect Voxora Node locally

In `server/.env`:

```env
PIPER_URL=http://localhost:5100
PIPER_AUTH_TOKEN=
```

Then:

```powershell
npm run dev
```

Voxora `/api/voices` will aggregate Edge + Piper.

## Production

The Piper service is a separate long-running container. Deploy it to a machine/container host that can keep the `/models` volume persistent.

Then set in the Voxora backend:

```env
PIPER_URL=https://your-piper-service.example.com
PIPER_AUTH_TOKEN=your-long-random-token
```

Do not expose an unauthenticated public Piper service.

## Multi-speaker voices

Some Piper models expose multiple speakers. Voxora expands these into separate selectable voices using IDs such as:

```text
piper:vi_VN-vivos-x_low#speaker=0
```

This means a single multi-speaker model can appear as many distinct speaker options without inventing new TTS models.

## Model licensing

The Piper engine at `OHF-Voice/piper1-gpl` is GPL-3.0. Individual voice models have their own model-card/license information. Review the license of every model before using it in a public/commercial product.

The official Piper voice repository is a catalog of model files and metadata; the repository itself currently shows 35 languages, but individual model licenses still need to be checked.

## Performance

Do not preload every model. Piper models can be tens of megabytes each.

This service uses on-demand download and an in-memory loaded-model cache. Keep `/models` on persistent storage so a restart does not require downloading every model again.

For CPU-only hosting, start with one worker. Add hardware acceleration only after the basic service works.

## Supported output

Voxora asks Piper for:

- MP3
- WAV

Piper synthesizes WAV internally; FFmpeg in this service applies pitch/volume transforms and converts to MP3 when requested.

## Sources

- Official Piper HTTP API: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md
- Piper voice catalog: https://huggingface.co/rhasspy/piper-voices
