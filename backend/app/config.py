"""Runtime configuration, read from environment variables (and backend/.env for local dev)."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


class Settings:
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_base_url: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")

    # Fallback chains. Groq free-tier limits are per model, so falling back to the
    # next model on HTTP 429 uses a separate quota legitimately (no extra accounts/keys).
    asr_models: list[str] = _list("ASR_MODELS", "whisper-large-v3,whisper-large-v3-turbo")
    llm_models: list[str] = _list(
        "LLM_MODELS", "openai/gpt-oss-120b,openai/gpt-oss-20b,llama-3.3-70b-versatile,llama-3.1-8b-instant"
    )

    # Abuse / cost protection for a public demo link.
    per_ip_per_minute: int = int(os.getenv("PER_IP_PER_MINUTE", "20"))
    daily_audio_seconds: int = int(os.getenv("DAILY_AUDIO_SECONDS", "6000"))
    daily_llm_calls: int = int(os.getenv("DAILY_LLM_CALLS", "1500"))
    daily_tts_calls: int = int(os.getenv("DAILY_TTS_CALLS", "3000"))
    max_audio_bytes: int = int(os.getenv("MAX_AUDIO_BYTES", str(2_500_000)))
    max_json_bytes: int = int(os.getenv("MAX_JSON_BYTES", str(48_000)))

    # Local-only recorder for building the eval dataset (never enable on the public deploy).
    lab_enabled: bool = os.getenv("LAB_ENABLED", "0") == "1"
    eval_audio_dir: Path = ROOT_DIR / "evals" / "audio"

    static_dir: Path = Path(os.getenv("STATIC_DIR", str(ROOT_DIR / "frontend" / "dist")))
    prompt_version: str = os.getenv("PARSER_PROMPT_VERSION", "parser_v2")


settings = Settings()
