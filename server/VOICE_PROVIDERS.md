# Voxora Voice Providers

## Edge TTS

The default online provider fetches the complete voice list from the Microsoft Edge TTS service using the provider library.

Voice IDs are never invented.

## Piper

Voxora now supports a real self-hosted Piper provider.

Set:

```env
PIPER_URL=https://your-piper-service.example.com
PIPER_AUTH_TOKEN=your-secret-token
```

The Piper service exposes:

- `GET /voices`
- `GET /all-voices`
- `POST /tts`
- `GET /health`

The service uses the official Piper voice catalog and downloads a requested model only when it is first used.

### Voice catalog

Each Piper model/quality variant is exposed as a voice. Multi-speaker models are expanded into individual speaker entries.

Example:

```text
piper:vi_VN-vivos-x_low#speaker=0
piper:vi_VN-vivos-x_low#speaker=1
...
```

This allows a multi-speaker model to provide many selectable speaker voices.

## Licensing

The current OHF-Voice Piper engine is GPL-3.0. Voice model licenses vary. Check each model's MODEL_CARD before public or commercial use.
