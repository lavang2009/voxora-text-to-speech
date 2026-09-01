import io
import json
import math
import os
import subprocess
import tempfile
import threading
import urllib.request
import wave
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, Response
from piper import PiperVoice, SynthesisConfig
from piper.download_voices import download_voice

APP = Flask(__name__)

MODELS_DIR = Path(
    os.getenv("PIPER_MODELS_DIR", "/models")
)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

CATALOG_URL = os.getenv(
    "PIPER_CATALOG_URL",
    "https://huggingface.co/rhasspy/piper-voices/raw/main/voices.json",
)

AUTH_TOKEN = os.getenv(
    "PIPER_AUTH_TOKEN",
    "",
).strip()

POPULAR_LANGUAGES = {
    "ar_JO",
    "de_DE",
    "en_GB",
    "en_US",
    "es_ES",
    "es_MX",
    "fr_FR",
    "hi_IN",
    "id_ID",
    "it_IT",
    "ja_JP",
    "ko_KR",
    "nl_NL",
    "pl_PL",
    "pt_BR",
    "pt_PT",
    "ru_RU",
    "th_TH",
    "tr_TR",
    "uk_UA",
    "vi_VN",
    "zh_CN",
}

_catalog_lock = threading.Lock()
_catalog: dict[str, dict[str, Any]] | None = None

_voice_cache_lock = threading.Lock()
_voice_cache: dict[str, PiperVoice] = {}


def authorized() -> bool:
    if not AUTH_TOKEN:
        return True

    header = request.headers.get(
        "Authorization",
        "",
    )

    return header == f"Bearer {AUTH_TOKEN}"


def require_auth():
    if authorized():
        return None

    return jsonify(
        {
            "success": False,
            "error": {
                "code": "UNAUTHORIZED",
                "message": "Invalid Piper service token.",
            },
        }
    ), 401


def fetch_catalog() -> dict[str, dict[str, Any]]:
    global _catalog

    if _catalog is not None:
        return _catalog

    with _catalog_lock:
        if _catalog is not None:
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
                raise ValueError(
                    "Piper catalog is not an object."
                )

            cache_file.write_text(
                json.dumps(
                    data,
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            _catalog = data
            return data

        except Exception:
            if cache_file.exists():
                _catalog = json.loads(
                    cache_file.read_text(
                        encoding="utf-8"
                    )
                )

                return _catalog

            raise


def language_info(item: dict[str, Any]) -> dict[str, Any]:
    language = item.get("language") or {}

    if not isinstance(language, dict):
        language = {}

    return language


def quality_rank(quality: str) -> int:
    return {
        "high": 3,
        "medium": 2,
        "low": 1,
        "x_low": 0,
    }.get(
        quality,
        0,
    )


def build_voice_catalog() -> list[dict[str, Any]]:
    catalog = fetch_catalog()

    result: list[dict[str, Any]] = []

    for model_id, item in catalog.items():
        lang = language_info(item)
        locale = str(
            lang.get("code") or ""
        ).replace(
            "_",
            "-",
        )

        if not locale:
            continue

        language = locale.split("-")[0]
        model_name = str(
            item.get("name") or model_id
        )
        quality = str(
            item.get("quality") or "unknown"
        )
        num_speakers = int(
            item.get("num_speakers") or 1
        )

        popular = (
            locale in {
                value.replace("_", "-")
                for value in POPULAR_LANGUAGES
            }
            and quality_rank(quality) >= 2
        )

        speaker_map = (
            item.get("speaker_id_map")
            or {}
        )

        if num_speakers > 1:
            # Multi-speaker Piper models such as VIVOS are exposed as individual voices so the frontend can select each speaker.
            speaker_items = list(
                speaker_map.items()
            )

            if not speaker_items:
                speaker_items = [
                    (
                        f"Speaker {index + 1}",
                        index,
                    )
                    for index in range(
                        num_speakers
                    )
                ]

            for speaker_name, speaker_id in speaker_items:
                speaker_id = int(
                    speaker_id
                )

                result.append(
                    {
                        "id": f"{model_id}#speaker={speaker_id}",
                        "name": (
                            f"{model_name} · "
                            f"{speaker_name}"
                        ),
                        "language": language,
                        "locale": locale,
                        "gender": "Neutral",
                        "provider": "Piper",
                        "type": f"piper-{quality}",
                        "providerVoiceId": (
                            f"{model_id}#speaker={speaker_id}"
                        ),
                        "isPopular": popular,
                        "speakerId": speaker_id,
                        "speakerName": str(
                            speaker_name
                        ),
                        "numSpeakers": num_speakers,
                        "quality": quality,
                        "modelId": model_id,
                    }
                )
        else:
            result.append(
                {
                    "id": model_id,
                    "name": model_name,
                    "language": language,
                    "locale": locale,
                    "gender": "Neutral",
                    "provider": "Piper",
                    "type": f"piper-{quality}",
                    "providerVoiceId": model_id,
                    "isPopular": popular,
                    "numSpeakers": 1,
                    "quality": quality,
                    "modelId": model_id,
                }
            )

    result.sort(
        key=lambda voice: (
            not bool(
                voice.get("isPopular")
            ),
            voice.get("locale", ""),
            voice.get("name", ""),
        )
    )

    return result


def find_model_file(model_id: str) -> Path | None:
    expected = MODELS_DIR / f"{model_id}.onnx"

    if expected.exists():
        return expected

    for path in MODELS_DIR.rglob(
        f"{model_id}.onnx"
    ):
        return path

    return None


def ensure_model(model_id: str) -> Path:
    model_file = find_model_file(
        model_id
    )

    if model_file is not None:
        return model_file

    catalog = fetch_catalog()

    if model_id not in catalog:
        raise ValueError(
            f"Piper model '{model_id}' is not in the official voice catalog."
        )

    print(
        f"[Piper] Downloading model: {model_id}",
        flush=True,
    )

    download_voice(
        model_id,
        MODELS_DIR,
    )

    model_file = find_model_file(
        model_id
    )

    if model_file is None:
        raise RuntimeError(
            f"Piper download completed but model '{model_id}' was not found."
        )

    return model_file


def load_voice(
    model_id: str,
) -> PiperVoice:
    with _voice_cache_lock:
        cached = _voice_cache.get(
            model_id
        )

        if cached is not None:
            return cached

        model_path = ensure_model(
            model_id
        )

        print(
            f"[Piper] Loading model: {model_id}",
            flush=True,
        )

        voice = PiperVoice.load(
            model_path,
            use_cuda=(
                os.getenv(
                    "PIPER_USE_CUDA",
                    "false",
                ).lower()
                == "true"
            ),
        )

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

    speed = max(
        0.5,
        min(
            2.0,
            float(speed),
        ),
    )

    length_scale = 1.0 / speed

    config = SynthesisConfig(
        speaker_id=speaker_id_value,
        length_scale=length_scale,
    )

    with io.BytesIO() as wav_io:
        wav_file = wave.open(
            wav_io,
            "wb",
        )

        try:
            initialized = False

            for audio_chunk in voice.synthesize(
                text,
                config,
            ):
                if not initialized:
                    wav_file.setframerate(
                        audio_chunk.sample_rate
                    )

                    wav_file.setsampwidth(
                        audio_chunk.sample_width
                    )

                    wav_file.setnchannels(
                        audio_chunk.sample_channels
                    )

                    initialized = True

                wav_file.writeframes(
                    audio_chunk.audio_int16_bytes
                )
        finally:
            wav_file.close()

        return wav_io.getvalue()


def ffmpeg_transform(
    wav_data: bytes,
    fmt: str,
    pitch: float,
    volume: float,
) -> bytes:
    if fmt not in {
        "mp3",
        "wav",
    }:
        fmt = "mp3"

    if fmt == "wav" and (
        abs(pitch) < 0.001
        and abs(volume - 1.0) < 0.001
    ):
        return wav_data

    with tempfile.TemporaryDirectory(
        prefix="voxora-piper-"
    ) as temp:
        input_path = (
            Path(temp) / "input.wav"
        )

        output_path = (
            Path(temp) /
            (
                "output.mp3"
                if fmt == "mp3"
                else "output.wav"
            )
        )

        input_path.write_bytes(
            wav_data
        )

        filters: list[str] = []

        # Pitch is interpreted as +/-5 semitones across the UI's +/-50 range.
        semitones = max(
            -5.0,
            min(
                5.0,
                float(pitch) / 10.0,
            ),
        )

        if abs(semitones) > 0.001:
            factor = 2 ** (
                semitones / 12.0
            )

            filters.append(
                f"asetrate=44100*{factor:.8f}"
            )

            filters.append(
                "aresample=44100"
            )

            filters.append(
                f"atempo={1.0 / factor:.8f}"
            )

        volume_value = max(
            0.0,
            min(
                1.5,
                float(volume),
            ),
        )

        if (
            abs(volume_value - 1.0)
            > 0.001
        ):
            filters.append(
                f"volume={volume_value:.4f}"
            )

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
            command += [
                "-af",
                ",".join(filters),
            ]

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

        command.append(
            str(output_path)
        )

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

        return output_path.read_bytes()


@APP.get("/health")
def health():
    response = {
        "success": True,
        "data": {
            "status": "ok",
            "engine": "Piper",
            "modelsDir": str(
                MODELS_DIR
            ),
        },
    }

    return jsonify(response)


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
                },
            }
        )
    except Exception as exc:
        print(
            f"[Piper] voice catalog error: {exc}",
            flush=True,
        )

        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "PIPER_CATALOG_ERROR",
                    "message":
                        "Unable to load Piper voice catalog.",
                },
            }
        ), 503


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
        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "PIPER_CATALOG_ERROR",
                    "message":
                        str(exc),
                },
            }
        ), 503


@APP.post("/tts")
def tts():
    auth_error = require_auth()
    if auth_error:
        return auth_error

    body = request.get_json(
        silent=True
    ) or {}

    text = str(
        body.get("text", "")
    ).strip()

    if not text:
        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "EMPTY_TEXT",
                    "message":
                        "Text is empty.",
                },
            }
        ), 400

    if len(text) > int(
        os.getenv(
            "PIPER_MAX_TEXT_CHARS",
            "12000",
        )
    ):
        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "TEXT_TOO_LONG",
                    "message":
                        "Piper text input is too long.",
                },
            }
        ), 400

    voice_id = str(
        body.get(
            "voiceId",
            "",
        )
    ).strip()

    if not voice_id:
        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "VOICE_REQUIRED",
                    "message":
                        "voiceId is required.",
                },
            }
        ), 400

    if voice_id.startswith(
        "piper:"
    ):
        voice_id = voice_id[
            len("piper:") :
        ]

    speaker_id = None

    if "#speaker=" in voice_id:
        model_id, speaker_part = (
            voice_id.split(
                "#speaker=",
                1,
            )
        )

        voice_id = model_id

        try:
            speaker_id = int(
                speaker_part
            )
        except ValueError:
            speaker_id = None

    speed = float(
        body.get(
            "speed",
            1,
        )
    )

    pitch = float(
        body.get(
            "pitch",
            0,
        )
    )

    volume = float(
        body.get(
            "volume",
            1,
        )
    )

    fmt = str(
        body.get(
            "format",
            "mp3",
        )
    ).lower()

    if fmt not in {
        "mp3",
        "wav",
    }:
        fmt = "mp3"

    try:
        voice = load_voice(
            voice_id
        )

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

        return Response(
            audio_data,
            status=200,
            mimetype=mime,
            headers={
                "Content-Disposition":
                    (
                        f'attachment; filename="'
                        f'voxora-{voice_id}.{fmt}"'
                    )
            },
        )

    except Exception as exc:
        print(
            f"[Piper] synthesis error: {exc}",
            flush=True,
        )

        return jsonify(
            {
                "success": False,
                "error": {
                    "code":
                        "PIPER_SYNTHESIS_ERROR",
                    "message":
                        str(exc),
                },
            }
        ), 502


if __name__ == "__main__":
    APP.run(
        host="0.0.0.0",
        port=int(
            os.getenv(
                "PORT",
                "5100",
            )
        ),
    )
