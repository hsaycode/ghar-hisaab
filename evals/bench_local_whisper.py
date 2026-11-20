"""Benchmark local faster-whisper (CPU, int8) on synthetic Indic money phrases.

Synthetic TTS speech is clean, so these numbers are an UPPER bound on real-world accuracy.
"""
import asyncio
import os
import sys
import time
from pathlib import Path

ROOT = Path(sys.argv[1])
OUT = Path(sys.argv[2])
sys.path.insert(0, str(ROOT / "backend"))
from app import tts  # noqa: E402
from app.numbers import find_numbers, normalize_text  # noqa: E402

PHRASES = [
    ("hi", "सब्ज़ी साठ रुपये, दवाई चार सौ बीस और ऑटो में पचास"),
    ("hi", "राशन साढ़े तीन सौ का, दूध वाला आज नहीं आया"),
    ("mr", "भाजी पन्नास रुपये आणि औषध दोनशे"),
    ("bn", "সবজি ষাট টাকা আর ওষুধ চারশো কুড়ি"),
    ("te", "కూరగాయలు అరవై రూపాయలు, మందులు మూడు వందలు"),
    ("ta", "காய்கறி அறுபது ரூபாய், மருந்து இருநூற்று ஐம்பது"),
    ("en", "Vegetables sixty, medicine four hundred twenty, auto fifty"),
]
EXPECTED = [[60, 420, 50], [350], [50, 200], [60, 420], [60, 300], [60, 250], [60, 420, 50]]


async def make_audio():
    OUT.mkdir(parents=True, exist_ok=True)
    paths = []
    for i, (lang, text) in enumerate(PHRASES):
        p = OUT / f"p{i}_{lang}.mp3"
        if not p.exists():
            p.write_bytes(await tts.synthesize(text, lang))
        paths.append(p)
    return paths


def main():
    paths = asyncio.run(make_audio())
    from faster_whisper import WhisperModel
    for size in sys.argv[3:]:
        t0 = time.perf_counter()
        model = WhisperModel(size, device="cpu", compute_type="int8")
        load = time.perf_counter() - t0
        hits = total = 0
        times = []
        print(f"\n=== {size} (load {load:.1f}s) ===")
        for (lang, ref), path, exp in zip(PHRASES, paths, EXPECTED):
            t1 = time.perf_counter()
            segs, info = model.transcribe(str(path), language=lang, beam_size=1, vad_filter=False)
            text = " ".join(s.text.strip() for s in segs)
            dt = time.perf_counter() - t1
            times.append(dt)
            got = [h.value for h in find_numbers(normalize_text(text))]
            ok = sum(1 for v in exp if v in got)
            hits += ok
            total += len(exp)
            print(f"[{lang}] {dt:5.1f}s amounts {ok}/{len(exp)} | {text}")
        print(f"--> {size}: amounts correct {hits}/{total}, mean {sum(times)/len(times):.1f}s per clip (audio ~3-5s)")


if __name__ == "__main__":
    main()
