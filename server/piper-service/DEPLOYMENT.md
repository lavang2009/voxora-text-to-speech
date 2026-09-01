# Piper container deployment checklist

## 1. Build locally

```bash
docker build -t voxora-piper ./piper-service
```

## 2. Run locally

```bash
docker run --rm \
  -p 5100:5100 \
  -e PORT=5100 \
  -e PIPER_AUTH_TOKEN="change-me" \
  -e PIPER_CORS_ORIGIN="http://localhost:5173" \
  -v voxora_piper_models:/models \
  voxora-piper
```

## 3. Verify

```text
GET /health
GET /ready
GET /voices
```

`/health` is intentionally lightweight. `/ready` verifies that the voice catalog can be loaded.

## 4. Production environment

Set:

```env
PORT=<platform-provided-port>
PIPER_MODELS_DIR=/models
PIPER_AUTH_TOKEN=<long-random-secret>
PIPER_CORS_ORIGIN=https://voxora-text-to-speech.vercel.app
PIPER_MAX_TEXT_CHARS=12000
PIPER_MAX_REQUEST_BYTES=524288
PIPER_CATALOG_CACHE_SECONDS=900
PIPER_USE_CUDA=false
GUNICORN_WORKERS=1
GUNICORN_THREADS=4
GUNICORN_TIMEOUT=300
```

The container listens on `0.0.0.0:${PORT}`. Do not hard-code the production port at the platform layer.

## 5. Persistent storage

Mount persistent storage at `/models`. Models are downloaded on demand and cached there. Without persistent storage, a restart can require model downloads again.

## 6. Connect Voxora

After the container receives a public HTTPS hostname, set in the Voxora backend:

```env
PIPER_URL=https://your-piper-host.example
PIPER_AUTH_TOKEN=<same-secret>
PIPER_VOICE_CACHE_MS=900000
```

The Node backend calls:

```text
GET  /voices
POST /tts
```

## 7. First voice test

Use a short request first. A model is downloaded lazily on first synthesis, so the first request for a model may take longer than later requests.

## 8. Licensing

The Piper engine and individual voice models can have different licensing terms. Review the license/model card for every model before public or commercial use.
