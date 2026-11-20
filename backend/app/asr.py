"""Speech -> text via Groq Whisper, with hallucination filtering."""
from __future__ import annotations

from . import groq_client

LANGS = {"hi", "mr", "bn", "te", "ta", "en"}

# Whisper is known to produce these on silence/noise (generic YouTube-style phrases).
HALLUCINATION_PHRASES = [
    "thank you for watching", "thanks for watching", "please subscribe", "like and subscribe",
    "subtitles by", "धन्यवाद देखने के लिए", "सब्सक्राइब", "amara.org",
]


def _hint_prompt(hint_words: list[str], max_chars: int = 400) -> str:
    """Whisper prompt is capped at 224 tokens; Indic script is token-hungry, so cap by chars."""
    out, total = [], 0
    for w in hint_words:
        w = w.strip()
        if not w or w in out:
            continue
        if total + len(w) + 2 > max_chars:
            break
        out.append(w)
        total += len(w) + 2
    return ", ".join(out)


async def transcribe(audio: bytes, mime: str, lang: str, hint_words: list[str]) -> dict:
    language = lang if lang in LANGS else None
    prompt = _hint_prompt(hint_words) or None
    raw, info = await groq_client.transcribe(audio, mime, language, prompt)
    segments = raw.get("segments") or []
    kept, dropped = [], 0
    for s in segments:
        nsp = float(s.get("no_speech_prob", 0) or 0)
        alp = float(s.get("avg_logprob", 0) or 0)
        if nsp > 0.6 and alp < -1.0:
            dropped += 1
            continue
        kept.append(s)
    text = " ".join((s.get("text") or "").strip() for s in kept).strip() if segments else (raw.get("text") or "").strip()
    low = text.lower()
    if any(p in low for p in HALLUCINATION_PHRASES):
        text, dropped = "", dropped + 1
    avg_logprob = (sum(float(s.get("avg_logprob", 0) or 0) for s in kept) / len(kept)) if kept else None
    return {
        "text": text,
        "duration": raw.get("duration"),
        "language": raw.get("language"),
        "model": info.model,
        "latency_ms": info.latency_ms,
        "attempts": info.attempts,
        "segments_dropped": dropped,
        "avg_logprob": avg_logprob,
        "low_confidence": avg_logprob is not None and avg_logprob < -0.8,
    }
