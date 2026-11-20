"""Thin async client for Groq's OpenAI-compatible API with per-model fallback.

Groq free-tier rate limits are applied per model (per organisation). When a model returns
HTTP 429 (or is unavailable), we move to the next model in the configured chain. This uses
separate per-model quotas of the same account -- no extra keys or accounts.
"""
from __future__ import annotations

import json
import time
from dataclasses import dataclass, field

import httpx

from .config import settings


class GroqUnavailable(Exception):
    """All models in a chain are rate-limited / failing."""

    def __init__(self, message: str, quota: bool = False):
        super().__init__(message)
        self.quota = quota


class GroqBadRequest(Exception):
    pass


@dataclass
class CallInfo:
    model: str
    latency_ms: int
    attempts: list[dict] = field(default_factory=list)
    usage: dict | None = None


_available: set[str] | None = None
_available_at = 0.0
_client: httpx.AsyncClient | None = None


def _headers() -> dict:
    if not settings.groq_api_key:
        raise GroqUnavailable("GROQ_API_KEY is not set on the server")
    return {"Authorization": f"Bearer {settings.groq_api_key}"}


def _verify():
    """Use the OS certificate store when available (works behind antivirus HTTPS inspection,
    e.g. Norton on Windows, and on Linux servers); fall back to certifi."""
    try:
        import ssl

        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:
        return True


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(base_url=settings.groq_base_url, timeout=httpx.Timeout(30.0, connect=10.0),
                                    verify=_verify())
    return _client


def _unavailable(kind: str, attempts: list[dict], quota_hits: int) -> GroqUnavailable:
    if attempts and all("error" in a for a in attempts):
        return GroqUnavailable(f"Cannot reach Groq ({attempts[-1]['error']})")
    return GroqUnavailable(f"All {kind} models are busy", quota=quota_hits > 0)


async def available_models(force: bool = False) -> set[str]:
    """Model ids live for this key (cached 10 min). Empty set = unknown (don't filter)."""
    global _available, _available_at
    if not force and _available is not None and time.time() - _available_at < 600:
        return _available
    try:
        r = await client().get("/models", headers=_headers())
        r.raise_for_status()
        _available = {m["id"] for m in r.json().get("data", [])}
    except Exception:
        _available = set()
    _available_at = time.time()
    return _available


async def _chain(models: list[str]) -> list[str]:
    live = await available_models()
    chain = [m for m in models if not live or m in live]
    return chain or models


def _retryable(status: int) -> bool:
    return status == 429 or status >= 500


async def transcribe(audio: bytes, mime: str, language: str | None, prompt: str | None) -> tuple[dict, CallInfo]:
    ext = "webm"
    if "mp4" in mime or "m4a" in mime or "aac" in mime:
        ext = "m4a"
    elif "mpeg" in mime or "mp3" in mime:
        ext = "mp3"
    elif "ogg" in mime or ("opus" in mime and "webm" not in mime):
        ext = "ogg"
    elif "wav" in mime:
        ext = "wav"
    attempts: list[dict] = []
    quota_hits = 0
    t0 = time.perf_counter()
    for model in await _chain(settings.asr_models):
        data = {"model": model, "response_format": "verbose_json", "temperature": "0"}
        if language:
            data["language"] = language
        if prompt:
            data["prompt"] = prompt
        try:
            r = await client().post(
                "/audio/transcriptions", headers=_headers(), data=data,
                files={"file": (f"audio.{ext}", audio, mime or "application/octet-stream")},
            )
        except httpx.HTTPError as exc:
            attempts.append({"model": model, "error": type(exc).__name__})
            continue
        if r.status_code == 200:
            info = CallInfo(model=model, latency_ms=int((time.perf_counter() - t0) * 1000), attempts=attempts)
            return r.json(), info
        attempts.append({"model": model, "status": r.status_code})
        if r.status_code == 429:
            quota_hits += 1
        if _retryable(r.status_code):
            continue
        raise GroqBadRequest(f"ASR {model} -> {r.status_code}: {r.text[:300]}")
    raise _unavailable("speech", attempts, quota_hits)


def _supports_strict(model: str) -> bool:
    return model.startswith("openai/gpt-oss")


async def chat_json(messages: list[dict], schema: dict, schema_name: str = "hisaab") -> tuple[dict, CallInfo]:
    """Chat completion returning parsed JSON. Strict json_schema where supported, else json_object."""
    attempts: list[dict] = []
    quota_hits = 0
    t0 = time.perf_counter()
    for model in await _chain(settings.llm_models):
        modes = ["json_schema", "json_object"] if _supports_strict(model) else ["json_object"]
        for mode in modes:
            body: dict = {"model": model, "messages": messages, "temperature": 0, "max_completion_tokens": 1500}
            if mode == "json_schema":
                body["response_format"] = {"type": "json_schema",
                                           "json_schema": {"name": schema_name, "strict": True, "schema": schema}}
            else:
                body["response_format"] = {"type": "json_object"}
            if model.startswith("openai/gpt-oss"):
                body["reasoning_effort"] = "low"
            try:
                r = await client().post("/chat/completions", headers=_headers(), json=body)
            except httpx.HTTPError as exc:
                attempts.append({"model": model, "mode": mode, "error": type(exc).__name__})
                break
            if r.status_code == 200:
                payload = r.json()
                content = payload["choices"][0]["message"].get("content") or ""
                try:
                    parsed = json.loads(content)
                except json.JSONDecodeError:
                    attempts.append({"model": model, "mode": mode, "error": "invalid_json"})
                    continue
                info = CallInfo(model=model, latency_ms=int((time.perf_counter() - t0) * 1000),
                                attempts=attempts, usage=payload.get("usage"))
                return parsed, info
            attempts.append({"model": model, "mode": mode, "status": r.status_code})
            if r.status_code == 429:
                quota_hits += 1
                break  # next model (separate quota)
            if _retryable(r.status_code):
                break
            if r.status_code == 400 and mode == "json_schema":
                continue  # schema mode not accepted -> try json_object on the same model
            if r.status_code in (400, 404):
                break  # model-specific problem -> next model
            raise GroqBadRequest(f"LLM {model} -> {r.status_code}: {r.text[:300]}")
    raise _unavailable("language", attempts, quota_hits)
