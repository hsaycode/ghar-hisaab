"""In-memory per-IP rate limiting and global daily budgets (protects the shared Groq key)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from datetime import date

from fastapi import HTTPException, Request

from .config import settings

_hits: dict[str, deque] = defaultdict(deque)
_budget = {"day": date.today().isoformat(), "audio_seconds": 0.0, "llm_calls": 0, "tts_calls": 0}


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_ip(request: Request) -> None:
    ip = client_ip(request)
    now = time.time()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= settings.per_ip_per_minute:
        raise HTTPException(status_code=429, detail={"code": "slow_down"})
    q.append(now)


def _roll() -> None:
    today = date.today().isoformat()
    if _budget["day"] != today:
        _budget.update(day=today, audio_seconds=0.0, llm_calls=0, tts_calls=0)


def spend(kind: str, amount: float = 1) -> None:
    _roll()
    caps = {"audio_seconds": settings.daily_audio_seconds, "llm_calls": settings.daily_llm_calls,
            "tts_calls": settings.daily_tts_calls}
    if _budget[kind] + amount > caps[kind]:
        raise HTTPException(status_code=429, detail={"code": "daily_budget"})
    _budget[kind] += amount


def budget_snapshot() -> dict:
    _roll()
    return dict(_budget)


async def read_capped(request: Request, cap: int) -> bytes:
    """Read the raw body in memory with a hard cap (never spooled to disk)."""
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > cap:
            raise HTTPException(status_code=413, detail={"code": "too_large"})
        chunks.append(chunk)
    return b"".join(chunks)
