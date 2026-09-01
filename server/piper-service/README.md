# Voxora Piper Service

Real self-hosted Piper TTS service used by the Voxora Voice Aggregator.

## Why this is a separate service

The Voxora Node/Vercel API should stay stateless. Piper needs local model files and a long-running process, so it runs in its own container.

The service uses the current OHF-Voice Piper HTTP/Python stack and the official Piper voice catalog. The official HTTP API supports `/voices`, `/all-voices`, `/download`, and `/synthesize`; this service wraps that engine with a `/tts` endpoint tailored to Voxora and downloads models on demand.

## Run

From the `server` directory:

```powershell
docker compose -f docker-compose.piper.yml up --build
```

Then:

```text
http://localhost:5100/health
http://localhost:5100/voices
```

## Model storage

Models are stored in the named Docker volume:

```text
piper_models
```

They are downloaded only when a user first selects a Piper voice for synthesis.

Do not commit the models to GitHub.

## Authentication

Set:

```env
PIPER_AUTH_TOKEN=change-this-to-a-long-random-value
```

The Voxora Node backend must use the same token.

## Production

Deploy this container to a host that supports persistent disk storage. Then set:

```env
PIPER_URL=https://your-piper-service.example.com
PIPER_AUTH_TOKEN=your-long-random-token
```

in the Voxora backend.

## Voice count

`GET /voices` exposes all catalog model/quality variants. Multi-speaker Piper models are expanded into individual speaker entries. For example, a 65-speaker model can appear as 65 selectable speakers even though it is one underlying model.

The service does not invent neural voice IDs. Each model ID comes from the Piper catalog.

## Licensing

The Piper engine in `OHF-Voice/piper1-gpl` is GPL-3.0. The model catalog contains individual MODEL_CARD/license information. Review the license of every model before public or commercial use.

## References

Official HTTP API:
https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_HTTP.md

Official voice catalog:
https://huggingface.co/rhasspy/piper-voices
