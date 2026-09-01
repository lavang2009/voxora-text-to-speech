import io
import json
import os
import secrets
import subprocess
import tempfile
import threading
import time
import urllib.request
import wave
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, Response
from piper import PiperVoice, SynthesisConfig
from piper.download_voices import download_voice

APP = Flask(__name__)
APP.config["MAX_CONTENT_LENGTH"] = int(
    os.getenv("PIPER_MAX_REQUEST_BYTES", str(512 * 1024))
)

MODELS_DIR = Path(
    os.getenv("PIPER_MODELS_DIR", "/models")
)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

CATALOG_URL = os.getenv(
    "PIPER_CATALOG_URL",
    "https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json",
).strip()

AUTH_TOKEN = os.getenv("PIPER_AUTH_TOKEN", "").strip()

CORS_ORIGIN = os.getenv(
    "PIPER_CORS_ORIGIN", "*"
).strip()

MAX_TEXT_CHARS = int(
    os.getenv("PIPER_MAX_TEXT_CHARS", "12000")
)

CATALOG_CACHE_SECONDS = int(
    os.getenv("PIPER_CATALOG_CACHE_SECONDS", "900")
)

VERSION = os.getenv("PIPER_SERVICE_VERSION", "1.0.0")

POPULAR_LANGUAGES = {
    "ar_JO",
    "ca_ES",
    "cs_CZ",
    "cy_GB",
    "da_DK",
    "de_DE",
    "el_GR",
    "en_GB",
    "en_US",
    "es_ES",
    "es_MX",
    "fi_FI",
    "fr_FR",
    "hu_HU",
    "id_ID",
    "is_IS",
    "it_IT",
    "ja_JP",
    "ka_GE",
    "ko_KR",
    "nl_NL",
    "no_NO",
    "pl_PL",
    "pt_BR",
    "pt_PT",
    "ro_RO",
    "ru_RU",
    "sr_RS",
    "sv_SE",
    "sw_CD",
    "th_TH",
    "tr_TR",
    "uk_UA",
    "vi_VN",
    "zh_CN",
}

_catalog_lock = threading.Lock()
_catalog: dict[str, dict[str, Any]] | None = None
_catalog_loaded_at = 0.0

_voice_cache_lock = threading.Lock()
_voice_cache: dict[str, PiperVoice] = {}
_model_locks: dict[str, threading.Lock] = {}


def _json_error(code: str, message: str, status: int):
    return (
        jsonify(
            {
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                },
            }
        ),
        status,
    )


def _set_common_headers(response: Response):
    if CORS_ORIGIN:
        response.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
    response.headers["Vary"] = "Origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response


@app.after_request
def add_headers(response: Response):
    return _set_common_headers(response)


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = Response(status=204)
        response.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        response.headers["Access-Control-Max-Age"] = "600"
        return response
    return None


def authorized() -> bool:
    if not AUTH_TOKEN:
        return True

    header = request.headers.get("Authorization", "")
    expected = f"Bearer {AUTH_TOKEN}"
    return secrets.compare_digest(header, expected)


def require_auth():
    if authorized():
        return None
    return _json_error(
        "UNAUTHORIZED",
        "Invalid Piper service token.",
        401,
    )


def _load_cached_catalog_file() -> dict[str, dict[str, Any]] | None:
    cache_file = MODELS_DIR / "voices.json"
    if not cache_file.exists():
        return None

    try:
        value = json.loads(cache_file.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def fetch_catalog(force: bool = False) -> dict[str, dict[str, Any]]:
    global _catalog, _catalog_loaded_at

    now = time.time()

    if (
        not force
        and _catalog is not None
        and now - _catalog_loaded_at < CATALOG_CACHE_SECONDS
    ):
        return _catalog

    with _catalog_lock:
        now = time.time()
        if (
            not force
            and _catalog is not None
            and now - _catalog_loaded_at < CATALOG_CACHE_SECONDS
        ):
            return _catalog

        cache_file = MODELS_DIR / "voices.json"

        try:
            with urllib.request.urlopen(
                CATALOG_URL,
                timeout=30,
            ) as response:
                raw = response.read()

            data = json.loads(raw.decode("utf-8"))

            if not isinstance(data, dict):
                raise ValueError("Piper catalog is not an object.")

            cache_file.write_text(
                json.dumps(data, ensure_ascii=False),
                encoding="utf-8",
            )

            _catalog = data
            _catalog_loaded_at = time.time()
            return data

        except Exception as exc:
            cached = _load_cached_catalog_file()
            if cached is not None:
                _catalog = cached
                _catalog_loaded_at = time.time()
                print(
                    f"[Piper] catalog network fetch failed; using cached catalog: {exc}",
                    flush=True,
                )
                return cached

            raise


def language_info(item: dict[str, Any]) -> dict[str, Any]:
    language = item.get("language") or {}
    return language if isinstance(language, dict) else {}


def quality_rank(quality: str) -> int:
    return {
        "high": 4,
        "medium": 3,
        "low": 2,
        "x_low": 1,
    }.get(quality.lower(), 0)


def _model_display_name(model_id: str, item: dict[str, Any]) -> str:
    return str(item.get("name") or model_id)


def _license_name(item: dict[str, Any]) -> str | None:
    value = item.get("license")
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return str(value)


def build_voice_catalog() -> list[dict[str, Any]]:
    catalog = fetch_catalog()
    result: list[dict[str, Any]] = []

    for model_id, item in catalog.items():
        if not isinstance(item, dict):
            continue

        lang = language_info(item)
        locale_raw = str(lang.get("code") or "")
        locale = locale_raw.replace("_", "-")
        if not locale:
            continue

        language = locale.split("-")[0]
        model_name = _model_display_name(model_id, item)
        quality = str(item.get("quality") or "unknown")
        num_speakers = max(1, int(item.get("num_speakers") or 1))
        speaker_map = item.get("speaker_id_map") or {}

        popular = (
            locale_raw in POPULAR_LANGUAGES
            and quality_rank(quality) >= 3
        )

        license_name = _license_name(item)
        base = {
            "language": language,
            "locale": locale,
            "provider": "Piper",
            "type": f"piper-{quality}",
            "modelId": model_id,
            "quality": quality,
            "numSpeakers": num_speakers,
            "isPopular": popular,
        }

        if num_speakers > 1:
            speaker_items = list(speaker_map.items())
            if not speaker_items:
                speaker_items = [
                    (f"Speaker {index + 1}", index)
                    for index in range(num_speakers)
                ]

            for speaker_name, speaker_id in speaker_items:
                try:
                    speaker_id_int = int(speaker_id)
                except (TypeError, ValueError):
                    continue

                result.append(
                    {
                        "id": f"{model_id}#speaker={speaker_id_int}",
                        "name": f"{model_name} · {speaker_name}",
                        "gender": "Neutral",
                        "providerVoiceId": f"{model_id}#speaker={speaker_id_int}",
                        "speakerId": speaker_id_int,
                        "speakerName": str(speaker_name),
                        **base,
                        **({"license": license_name} if license_name else {}),
                    }
                )
        else:
            result.append(
                {
                    "id": model_id,
                    "name": model_name,
                    "gender": "Neutral",
                    "providerVoiceId": model_id,
                    **base,
                    **({"license": license_name} if license_name else {}),
                }
            )

    result.sort(
        key=lambda voice: (
            not bool(voice.get("isPopular")),
            voice.get("locale", ""),
            -int(quality_rank(str(voice.get("quality", "")))),
            voice.get("name", ""),
        )
    )

    return result


def find_model_file(model_id: str) -> Path | None:
    expected = MODELS_DIR / f"{model_id}.onnx"
    if expected.exists():
        return expected

    for candidate in MODELS_DIR.rglob(f"{model_id}.onnx"):
        return candidate

    return None


def _get_model_lock(model_id: str) -> threading.Lock:
    with _voice_cache_lock:
        lock = _model_locks.get(model_id)
        if lock is None:
            lock = threading.Lock()
            _model_locks[model_id] = lock
        return lock


def ensure_model(model_id: str) -> Path:
    model_file = find_model_file(model_id)
    if model_file is not None:
        return model_file

    catalog = fetch_catalog()
    if model_id not in catalog:
        raise ValueError(
            f"Piper model '{model_id}' is not in the official voice catalog."
        )

    lock = _get_model_lock(model_id)
    with lock:
        model_file = find_model_file(model_id)
        if model_file is not None:
            return model_file

        print(
            f"[Piper] downloading model: {model_id}",
            flush=True,
        )

        download_voice(
            model_id,
            MODELS_DIR,
        )

        model_file = find_model_file(model_id)
        if model_file is None:
            raise RuntimeError(
                f"Piper download completed but model '{model_id}' was not found."
            )

        print(
            f"[Piper] model ready: {model_file}",
            flush=True,
        )
        return model_file


def load_voice(model_id: str) -> PiperVoice:
    with _voice_cache_lock:
        cached = _voice_cache.get(model_id)
        if cached is not None:
            return cached

    model_lock = _get_model_lock(model_id)
    with model_lock:
        with _voice_cache_lock:
            cached = _voice_cache.get(model_id)
            if cached is not None:
                return cached

        model_path = ensure_model(model_id)

        print(
            f"[Piper] loading model: {model_id}",
            flush=True,
        )

        voice = PiperVoice.load(
            model_path,
            use_cuda=(
                os.getenv("PIPER_USE_CUDA", "false").lower() == "true"
            ),
        )

        with _voice_cache_lock:
            _voice_cache[model_id] = voice

        return voice


def synthesize_wav(
    voice: PiperVoice,
    text: str,
    speaker_id: int | None,
    speed: float,
) -> bytes:
    speaker_id_value = (
        speaker_id
        if speaker_id is not None
        else voice.config.default_speaker_id
    )

    speed = max(0.5, min(2.0, float(speed)))
    length_scale = 1.0 / speed

    config = SynthesisConfig(
        speaker_id=speaker_id_value,
        length_scale=length_scale,
    )

    with io.BytesIO() as wav_io:
        wav_file = wave.open(wav_io, "wb")
        initialized = False

        try:
            for audio_chunk in voice.synthesize(text, config):
                if not initialized:
                    wav_file.setframerate(audio_chunk.sample_rate)
                    wav_file.setsampwidth(audio_chunk.sample_width)
                    wav_file.setnchannels(audio_chunk.sample_channels)
                    initialized = True

                wav_file.writeframes(audio_chunk.audio_int16_bytes)
        finally:
            wav_file.close()

        if not initialized:
            raise RuntimeError("Piper produced no audio frames.")

        return wav_io.getvalue()


def _pitch_filter(pitch: float) -> list[str]:
    semitones = max(-5.0, min(5.0, float(pitch) / 10.0))
    if abs(semitones) <= 0.001:
        return []

    factor = 2 ** (semitones / 12.0)
    return [
        f"asetrate=44100*{factor:.8f}",
        "aresample=44100",
        f"atempo={1.0 / factor:.8f}",
    ]


def ffmpeg_transform(
    wav_data: bytes,
    fmt: str,
    pitch: float,
    volume: float,
) -> bytes:
    fmt = fmt.lower()
    if fmt not in {"mp3", "wav"}:
        fmt = "mp3"

    if fmt == "wav" and abs(pitch) < 0.001 and abs(volume - 1.0) < 0.001:
        return wav_data

    with tempfile.TemporaryDirectory(prefix="voxora-piper-") as temp:
        input_path = Path(temp) / "input.wav"
        output_path = Path(temp) / ("output.mp3" if fmt == "mp3" else "output.wav")
        input_path.write_bytes(wav_data)

        filters = _pitch_filter(pitch)

        volume_value = max(0.0, min(1.5, float(volume)))
        if abs(volume_value - 1.0) > 0.001:
            filters.append(f"volume={volume_value:.4f}")

        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(input_path),
        ]

        if filters:
            command += ["-af", ",".join(filters)]

        if fmt == "mp3":
            command += [
                "-codec:a",
                "libmp3lame",
                "-b:a",
                "192k",
            ]
        else:
            command += [
                "-ar",
                "44100",
                "-ac",
                "2",
            ]

        command.append(str(output_path))

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            raise RuntimeError(
                completed.stderr.strip()
                or "FFmpeg transformation failed."
            )

        data = output_path.read_bytes()
        if not data:
            raise RuntimeError("FFmpeg produced an empty audio file.")

        return data


@APP.get("/")
def root():
    return jsonify(
        {
            "success": True,
            "data": {
                "service": "voxora-piper",
                "version": VERSION,
                "engine": "Piper",
                "endpoints": [
                    "/health",
                    "/voices",
                    "/all-voices",
                    "/tts",
                ],
            },
        }
    )


@APP.get("/health")
def health():
    return jsonify(
        {
            "success": True,
            "data": {
                "status": "ok",
                "service": "voxora-piper",
                "engine": "Piper",
                "version": VERSION,
                "modelsDir": str(MODELS_DIR),
                "modelCacheSize": len(_voice_cache),
                "authEnabled": bool(AUTH_TOKEN),
            },
        }
    )


@APP.get("/ready")
def ready():
    try:
        catalog = fetch_catalog()
        return jsonify(
            {
                "success": True,
                "data": {
                    "status": "ready",
                    "catalogModels": len(catalog),
                },
            }
        )
    except Exception:
        return _json_error(
            "PIPER_NOT_READY",
            "Piper catalog is not available yet.",
            503,
        )


@APP.get("/voices")
def voices():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    try:
        data = build_voice_catalog()
        return jsonify(
            {
                "success": True,
                "data": data,
                "meta": {
                    "total": len(data),
                    "models": len(fetch_catalog()),
                    "cachedModels": len(_voice_cache),
                },
            }
        )
    except Exception as exc:
        print(
            f"[Piper] voice catalog error: {exc}",
            flush=True,
        )
        return _json_error(
            "PIPER_CATALOG_ERROR",
            "Unable to load Piper voice catalog.",
            503,
        )


@APP.get("/all-voices")
def all_voices():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    try:
        return jsonify(
            {
                "success": True,
                "data": fetch_catalog(),
            }
        )
    except Exception as exc:
        print(
            f"[Piper] full catalog error: {exc}",
            flush=True,
        )
        return _json_error(
            "PIPER_CATALOG_ERROR",
            "Unable to load Piper voice catalog.",
            503,
        )


@APP.post("/tts")
def tts():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return _json_error(
            "INVALID_JSON",
            "Request body must be JSON.",
            400,
        )

    text = str(body.get("text", "")).strip()
    if not text:
        return _json_error(
            "EMPTY_TEXT",
            "Text is empty.",
            400,
        )

    if len(text) > MAX_TEXT_CHARS:
        return _json_error(
            "TEXT_TOO_LONG",
            f"Piper text input is limited to {MAX_TEXT_CHARS} characters.",
            400,
        )

    voice_id = str(body.get("voiceId", "")).strip()
    if not voice_id:
        return _json_error(
            "VOICE_REQUIRED",
            "voiceId is required.",
            400,
        )

    if voice_id.startswith("piper:"):
        voice_id = voice_id[len("piper:") :]

    speaker_id: int | None = None
    if "#speaker=" in voice_id:
        model_id, speaker_part = voice_id.split("#speaker=", 1)
        voice_id = model_id
        try:
            speaker_id = int(speaker_part)
        except ValueError:
            return _json_error(
                "INVALID_SPEAKER",
                "speaker id must be an integer.",
                400,
            )

    speed = body.get("speed", 1)
    pitch = body.get("pitch", 0)
    volume = body.get("volume", 1)
    fmt = str(body.get("format", "mp3")).lower()

    try:
        speed = float(speed)
        pitch = float(pitch)
        volume = float(volume)
    except (TypeError, ValueError):
        return _json_error(
            "INVALID_AUDIO_SETTINGS",
            "speed, pitch and volume must be numeric.",
            400,
        )

    speed = max(0.5, min(2.0, speed))
    pitch = max(-50.0, min(50.0, pitch))
    volume = max(0.0, min(1.0, volume))

    if fmt not in {"mp3", "wav"}:
        fmt = "mp3"

    try:
        catalog = fetch_catalog()
        item = catalog.get(voice_id)
        if not isinstance(item, dict):
            return _json_error(
                "VOICE_NOT_FOUND",
                "Voice is not available in the Piper catalog.",
                404,
            )

        num_speakers = max(1, int(item.get("num_speakers") or 1))
        if speaker_id is not None and not 0 <= speaker_id < num_speakers:
            return _json_error(
                "INVALID_SPEAKER",
                f"speaker id must be between 0 and {num_speakers - 1}.",
                400,
            )

        print(
            f"[Piper] synth voice={voice_id} speaker={speaker_id} format={fmt} chars={len(text)}",
            flush=True,
        )

        voice = load_voice(voice_id)
        wav_data = synthesize_wav(
            voice,
            text,
            speaker_id,
            speed,
        )

        audio_data = ffmpeg_transform(
            wav_data,
            fmt,
            pitch,
            volume,
        )

        mime = (
            "audio/wav"
            if fmt == "wav"
            else "audio/mpeg"
        )

        safe_filename = voice_id.replace("/", "-").replace("\\", "-")

        return Response(
            audio_data,
            status=200,
            mimetype=mime,
            headers={
                "Content-Disposition": (
                    f'attachment; filename="voxora-{safe_filename}.{fmt}"'
                ),
                "Cache-Control": "no-store",
                "X-Piper-Voice": voice_id,
                "X-Piper-Speaker": str(
                    speaker_id if speaker_id is not None else 0
                ),
            },
        )

    except Exception as exc:
        print(
            f"[Piper] synthesis error: {exc}",
            flush=True,
        )
        return _json_error(
            "PIPER_SYNTHESIS_ERROR",
            "Piper failed to synthesize the requested audio.",
            502,
        )


@app.errorhandler(413)
def request_too_large(_error):
    return _json_error(
        "REQUEST_TOO_LARGE",
        "Request body is too large.",
        413,
    )


if __name__ == "__main__":
    APP.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5100")),
        threaded=True,
    )
