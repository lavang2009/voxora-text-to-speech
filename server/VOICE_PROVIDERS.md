# Voxora Voice Providers

## Edge TTS
The default provider fetches the complete voice list from the Microsoft Edge TTS voice service using `VoicesManager.create().find({})`.
Voice IDs are never invented. The API marks a curated set of returned voices/locales as `isPopular` only for sorting/filtering.

## Piper
Piper is optional. Set `PIPER_URL` to a separate Piper HTTP service that exposes:

- `GET /voices`
- `POST /tts`

Expected `/voices` response:

```json
{
  "data": [
    {
      "id": "model-id",
      "name": "Model name",
      "locale": "vi-VN",
      "gender": "Female",
      "language": "vi",
      "isPopular": true
    }
  ]
}
```

Expected `/tts` request body:

```json
{
  "text": "Hello",
  "voiceId": "model-id",
  "language": "vi-VN",
  "speed": 1,
  "pitch": 0,
  "volume": 1,
  "format": "mp3"
}
```

The registry automatically merges Edge TTS and Piper voices.
