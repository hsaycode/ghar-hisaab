"""Read-back audio via neural TTS (edge-tts) with an in-memory LRU cache.

Phone speech voices for mr/bn/te/ta are often missing on Android, so read-back is generated
server-side. If this fails, the client falls back to the browser's speechSynthesis.
"""
from __future__ import annotations

from collections import OrderedDict

VOICES = {
    "en": "en-IN-NeerjaNeural",
    "hi": "hi-IN-SwaraNeural",
    "mr": "mr-IN-AarohiNeural",
    "bn": "bn-IN-TanishaaNeural",
    "te": "te-IN-ShrutiNeural",
    "ta": "ta-IN-PallaviNeural",
}
_cache: OrderedDict[tuple[str, str], bytes] = OrderedDict()
_MAX = 400


async def synthesize(text: str, lang: str) -> bytes:
    key = (lang, text)
    if key in _cache:
        _cache.move_to_end(key)
        return _cache[key]
    import edge_tts  # imported lazily so tests don't need network

    voice = VOICES.get(lang, VOICES["hi"])
    audio = bytearray()
    async for chunk in edge_tts.Communicate(text, voice, rate="-8%").stream():
        if chunk.get("type") == "audio":
            audio.extend(chunk["data"])
    data = bytes(audio)
    if data:
        _cache[key] = data
        if len(_cache) > _MAX:
            _cache.popitem(last=False)
    return data
