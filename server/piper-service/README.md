# Voxora Piper Service — Container Deployment Ready

A long-running HTTP microservice for Voxora's Voice Aggregator, built around the official Piper Python/HTTP stack.

Piper's official HTTP server exposes voice discovery and synthesis over HTTP. This service keeps that architecture but adds Voxora-specific endpoints, authentication, catalog caching, on-demand model downloads, multi-speaker expansion, health/readiness checks, CORS, request limits, and MP3/WAV transformation. citeturn910748search0turn910748search7

## Endpoints

- `GET /` — service information
- `GET /health` — lightweight health check
- `GET /ready` — checks that the Piper catalog can be loaded
- `GET /voices` — normalized Voxora voice catalog
- `GET /all-voices` — raw Piper catalog
- `POST /tts` — synthesize audio

## Local Docker

From the `server` directory:

```powershell
docker compose -f docker-compose.piper.yml up --build
```

The service listens on:

```text
http://localhost:5100
```

Check:

```text
http://localhost:5100/health
http://localhost:5100/voices
```

## Production container

The image is designed for container hosts that provide an externally assigned `PORT` environment variable and persistent disk/volume support.

Build:

```bash
docker build -t voxora-piper ./piper-service
```

Run:

```bash
docker run --rm \
  -p 5100:5100 \
  -e PORT=5100 \
  -e PIPER_AUTH_TOKEN="replace-with-a-long-random-token" \
  -v voxora_piper_models:/models \
  voxora-piper
```

The image binds to `0.0.0.0:${PORT}` and uses one Gunicorn worker by default so large Piper models are not duplicated unnecessarily in memory.

## Required environment variables

```env
PORT=5100
PIPER_MODELS_DIR=/models
PIPER_AUTH_TOKEN=
PIPER_CORS_ORIGIN=https://voxora-text-to-speech.vercel.app
PIPER_CATALOG_URL=https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json
PIPER_MAX_TEXT_CHARS=12000
PIPER_MAX_REQUEST_BYTES=524288
PIPER_CATALOG_CACHE_SECONDS=900
PIPER_USE_CUDA=false
PIPER_SERVICE_VERSION=1.0.0
```

### `PIPER_AUTH_TOKEN`

Optional locally; recommended in production. The Voxora backend sends:

```text
Authorization: Bearer <same-token>
```

### `PIPER_CORS_ORIGIN`

Set this to the exact public frontend origin in production, for example:

```env
PIPER_CORS_ORIGIN=https://voxora-text-to-speech.vercel.app
```

## Persistent model storage

Piper models are downloaded on first use and cached in `/models`. Mount a persistent volume in production so a restart does not force the service to download the models again.

Do not commit `.onnx` models to GitHub.

## Voice catalog

`GET /voices` reads the Piper catalog and exposes:

- every model/quality variant in the catalog
- multi-speaker models as individual selectable speakers
- locale/language metadata
- provider metadata
- popularity hints for commonly used locales
- model/quality metadata

The service does not invent voice IDs. Model IDs come from the Piper catalog. The catalog's model cards/licenses should be reviewed before public or commercial distribution. citeturn910748search0turn910748search2

## Voxora backend configuration

After this container is deployed with a public HTTPS URL, set in the Voxora backend:

```env
PIPER_URL=https://YOUR-PIPER-DOMAIN
PIPER_AUTH_TOKEN=the-same-long-random-token
PIPER_VOICE_CACHE_MS=900000
```

Do not use `http://localhost:5100` from a Vercel deployment.

## Security

- Keep `PIPER_AUTH_TOKEN` private.
- Restrict `PIPER_CORS_ORIGIN` to the real Voxora frontend domain.
- Put HTTPS in front of the container.
- Use persistent disk for `/models`.
- Keep `PIPER_MAX_TEXT_CHARS` bounded.

## Notes for deployment platforms

Any platform that can run a Docker image with persistent storage can host this service. The container respects a platform-provided `PORT`, exposes `/health` for health checks, and keeps model files in `/models`.

Piper's official HTTP API itself uses a long-running HTTP server and supports `/voices` and `/synthesize`; this wrapper intentionally preserves that deployment model rather than trying to turn Piper into a Vercel serverless function. citeturn910748search0

## Licensing

The Piper engine and each voice model can have separate licensing terms. Review the engine license and each model's MODEL_CARD/license before exposing a voice publicly or using it commercially.
