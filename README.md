# Voxora

Full-stack Text-to-Speech SaaS with React/Vite/Tailwind, Firebase Auth + Firestore, Cloudinary, Express and a provider-based TTS architecture.

## What is real

- Firebase Authentication: email/password + Google + Apple + Microsoft + GitHub.
- Firestore: per-user profile, favorites, history, preferences and custom voice configuration.
- Cloudinary: avatar upload via authenticated backend endpoint. Generated audio can also be stored as Cloudinary raw assets so history URLs survive reloads.
- Provider TTS: `edge-tts-universal` on the server for real downloadable audio. Browser `speechSynthesis` is preview only.
- Long text: chunk -> provider render -> FFmpeg merge -> MP3 or WAV.
- No provider key is hard-coded in the browser.
- API authentication verifies Firebase ID tokens.

## Requirements

Node.js 22+, npm 10+, FFmpeg for non-Docker local backend execution, a Firebase project and a Cloudinary account.

## Install

```bash
npm install
npm install --prefix server
cp .env.example .env
cp server/.env.example server/.env
```

## Firebase

Create a Web App and copy its config to the root `.env`. Enable Firestore and Email/Password. Enable the social providers you want in Firebase Authentication.

Google/GitHub/Microsoft require their OAuth applications and redirect settings. Apple requires Apple Developer configuration and a Services ID; Firebase's current web docs use the Firebase auth handler as the return URL.

Deploy `server/firestore.rules`.

## Cloudinary

Put cloud name/API key/API secret in `server/.env`. Keep the secret server-side. Avatar uploads use an authenticated backend route and are restricted to JPG/PNG/WEBP, max 5 MB.

## Run

```bash
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`.

## Production

Frontend: Vercel/Netlify. Backend: Render/Railway/VPS. Docker Compose runs a frontend container and a backend container with FFmpeg.

## Environment

Frontend variables start with `VITE_`. Backend variables include Firebase Admin credentials and Cloudinary credentials.

## Notes on Edge TTS

The backend uses `edge-tts-universal` because its current Node API exposes real synthesis and live voice discovery without requiring an API key. It is an unofficial interface to Microsoft's Edge TTS service, so production deployments should monitor availability and review licensing/terms for the intended use.

## Testing

```bash
npm test
npm run build
npm test --prefix server
npm run build --prefix server
```

In environments where registry/network access is unavailable, dependency installation cannot be completed; run these commands on your machine/CI after restoring network access.
