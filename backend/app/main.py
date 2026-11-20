"""Ghar Hisaab API + static frontend."""
from __future__ import annotations

import json
import logging
import re
from datetime import date
from pathlib import Path
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import asr, groq_client, limits, parser, tts
from .config import settings

app = FastAPI(title="Ghar Hisaab", docs_url=None, redoc_url=None)
log = logging.getLogger("uvicorn.error")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
       "media-src 'self' blob: data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; "
       "base-uri 'self'; form-action 'self'")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Content-Security-Policy", CSP)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
    if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
    return response


def _error(exc: Exception) -> JSONResponse:
    if isinstance(exc, groq_client.GroqUnavailable):
        return JSONResponse(status_code=503 if not exc.quota else 429,
                            content={"detail": {"code": "quota" if exc.quota else "unavailable", "message": str(exc)}})
    return JSONResponse(status_code=502, content={"detail": {"code": "upstream", "message": str(exc)[:200]}})


@app.get("/api/health")
async def health():
    live = await groq_client.available_models() if settings.groq_api_key else set()
    return {
        "ok": True,
        "key_configured": bool(settings.groq_api_key),
        "asr_chain": [m for m in settings.asr_models if not live or m in live],
        "llm_chain": [m for m in settings.llm_models if not live or m in live],
        "prompt_version": settings.prompt_version,
        "prompt_hash": parser.prompt_hash(settings.prompt_version),
        "lab_enabled": settings.lab_enabled,
        "budget": limits.budget_snapshot(),
    }


@app.post("/api/transcribe")
async def transcribe(request: Request, lang: str = "hi", hint: str = ""):
    limits.check_ip(request)
    audio = await limits.read_capped(request, settings.max_audio_bytes)
    if len(audio) < 1200:
        raise HTTPException(status_code=400, detail={"code": "no_audio"})
    # Rough duration estimate for the budget (~4 KB/s at 32 kbps), billed min 10 s by Groq.
    limits.spend("audio_seconds", max(10.0, len(audio) / 4000))
    mime = request.headers.get("content-type", "audio/webm")
    hint_words = [w for w in unquote(hint).split("|") if w][:40]
    try:
        return await asr.transcribe(audio, mime, lang, hint_words)
    except (groq_client.GroqUnavailable, groq_client.GroqBadRequest) as exc:
        return _error(exc)


class ParseIn(BaseModel):
    transcript: str = Field(max_length=4000)
    lang: str = "hi"
    today: str | None = None
    context: parser.ParseContext = Field(default_factory=parser.ParseContext)


@app.post("/api/parse")
async def parse(request: Request):
    limits.check_ip(request)
    raw = await limits.read_capped(request, settings.max_json_bytes)
    try:
        body = ParseIn.model_validate_json(raw)
    except Exception:
        raise HTTPException(status_code=400, detail={"code": "bad_request"})
    if not body.transcript.strip():
        return {"result": parser.ParseResult(intent="unclear").model_dump(), "meta": {}}
    limits.spend("llm_calls")
    try:
        result, meta = await parser.parse(body.transcript, body.lang, body.today or date.today().isoformat(),
                                          body.context)
    except (groq_client.GroqUnavailable, groq_client.GroqBadRequest) as exc:
        return _error(exc)
    return {"result": result.model_dump(), "meta": meta}


class TtsIn(BaseModel):
    text: str = Field(max_length=600)
    lang: str = "hi"


@app.post("/api/tts")
async def speak(request: Request):
    limits.check_ip(request)
    raw = await limits.read_capped(request, 4000)
    try:
        body = TtsIn.model_validate_json(raw)
    except Exception:
        raise HTTPException(status_code=400, detail={"code": "bad_request"})
    limits.spend("tts_calls")
    try:
        audio = await tts.synthesize(body.text, body.lang)
    except Exception as exc:  # log the error type only (never the text)
        log.warning("tts failed: %s: %s", type(exc).__name__, str(exc)[:160])
        raise HTTPException(status_code=503, detail={"code": "tts_unavailable"})
    if not audio:
        raise HTTPException(status_code=503, detail={"code": "tts_unavailable"})
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


_SAFE = re.compile(r"[^A-Za-z0-9_\-]")


@app.post("/api/lab/save")
async def lab_save(request: Request, speaker: str, case_id: str, lang: str, kind: str = "scripted"):
    """Local-only: save an eval recording to evals/audio/ and append to the local manifest."""
    if not settings.lab_enabled:
        raise HTTPException(status_code=404)
    audio = await limits.read_capped(request, settings.max_audio_bytes)
    mime = request.headers.get("content-type", "audio/webm")
    ext = "m4a" if "mp4" in mime else "webm"
    spk, cid = _SAFE.sub("_", speaker)[:40], _SAFE.sub("_", case_id)[:60]
    folder = settings.eval_audio_dir / spk
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{cid}.{ext}"
    path.write_bytes(audio)
    rel = path.relative_to(settings.eval_audio_dir).as_posix()
    line = {"audio": rel, "case_id": case_id, "speaker": spk, "lang": lang, "kind": kind}
    with open(settings.eval_audio_dir / "recordings.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(line, ensure_ascii=False) + "\n")
    return {"saved": rel}


# ---- static frontend (built by Vite) -------------------------------------------------------
static_dir: Path = settings.static_dir
if static_dir.exists():
    app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa(path: str):
        candidate = (static_dir / path).resolve()
        if path and candidate.is_file() and static_dir.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(static_dir / "index.html")
