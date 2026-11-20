"""L1 + end-to-end eval on recorded audio (your own voice, hostel-mates, simulated conversations).

Audio + manifest come from the in-app Recording Lab (#/lab, server with LAB_ENABLED=1):
  evals/audio/recordings.jsonl   {"audio": "spk01/hi-002.webm", "case_id": "hi-002", "speaker": "spk01", "lang": "hi", "kind": "scripted"}
Free-form recordings are labelled in evals/cases/voice_labels.jsonl:
  {"case_id": "free_hi_...", "reference": "<what was said>", "expected": {"intent": "log", "entries": [...]}}
Speakers are assigned to dev/test in evals/audio/speakers.json  {"spk01": "dev", "spk02": "test"}  (split by speaker).

  python evals/run_voice_eval.py --split dev
  python evals/run_voice_eval.py --split test --publish
"""
from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import sys

import jiwer

from evallib import (CACHE, EVAL_CONTEXT, EVAL_TODAY, EVALS, Throttle, aggregate, check_frozen, cluster_bootstrap,
                     load_jsonl, pctl, run_meta, score_case, sha256_file, write_run)
from app import asr, groq_client
from app import parser as P
from app.config import settings
from app.numbers import find_numbers, normalize_text

AUDIO = EVALS / "audio"


def amount_tokens(text: str) -> list[float]:
    return sorted(h.value for h in find_numbers(normalize_text(text)))


def number_confusions(ref: str, hyp: str) -> list[tuple[float, float]]:
    """Pairs (spoken amount -> amount the ASR wrote instead), aligned by order of the leftovers."""
    r, h = amount_tokens(ref), amount_tokens(hyp)
    missing = [v for v in r if v not in h]
    extra = [v for v in h if v not in r]
    return list(zip(missing, extra))


def amount_token_errors(ref: str, hyp: str) -> tuple[int, int]:
    """(# reference amounts not reproduced in the transcript, # reference amounts)."""
    r, h = amount_tokens(ref), amount_tokens(hyp)
    missing = 0
    pool = list(h)
    for v in r:
        if v in pool:
            pool.remove(v)
        else:
            missing += 1
    return missing, len(r)


async def transcribe_cached(path, lang: str) -> dict:
    key = f"{sha256_file(path)}-{lang}-{'_'.join(settings.asr_models)}"
    cf = CACHE / "asr" / f"{key}.json"
    if cf.exists():
        return json.loads(cf.read_text(encoding="utf-8")) | {"cached": True}
    mime = mimetypes.guess_type(path.name)[0] or ("audio/webm" if path.suffix == ".webm" else "audio/mp4")
    hints = ["Dadi", "Dadaji", "Doodhwala", "Kamla", "Gupta Kirana", "Ramesh"]
    out = await asr.transcribe(path.read_bytes(), mime, lang, hints)
    cf.parent.mkdir(parents=True, exist_ok=True)
    cf.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["dev", "test", "all"], default="dev")
    ap.add_argument("--rpm", type=float, default=3.0)
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--allow-unfrozen", action="store_true")
    ap.add_argument("--audio-dir", default=str(AUDIO))
    args = ap.parse_args()

    recs = load_jsonl(AUDIO / "recordings.jsonl")
    speakers = json.loads((AUDIO / "speakers.json").read_text(encoding="utf-8")) if (AUDIO / "speakers.json").exists() else {}
    text_cases = {c["id"]: c for c in load_jsonl(EVALS / "cases" / "text_cases.jsonl")}
    labels = {x["case_id"]: x for x in load_jsonl(EVALS / "cases" / "voice_labels.jsonl")}
    items = []
    for r in recs:
        split = speakers.get(r["speaker"], "dev")
        if args.split != "all" and split != args.split:
            continue
        if r["case_id"] in text_cases:
            tc = text_cases[r["case_id"]]
            items.append({**r, "split": split, "reference": tc["text"], "expected": tc["expected"], "source": "scripted"})
        elif r["case_id"] in labels:
            lb = labels[r["case_id"]]
            items.append({**r, "split": split, "reference": lb["reference"], "expected": lb["expected"],
                          "source": lb.get("source", "freeform")})
    if not items:
        raise SystemExit("No labelled recordings for this split. Record in #/lab, then label free-form clips.")
    frozen = True
    if args.split in ("test", "all"):
        frozen = check_frozen("voice_test", [{k: i[k] for k in ("audio", "case_id", "speaker", "reference")} for i in items
                                             if i["split"] == "test"], args.allow_unfrozen)

    throttle = Throttle(args.rpm)
    rows, scored, failures, asr_lat, parse_lat = [], [], [], [], []
    cer_by_spk: dict[str, list[int]] = {}
    exact_by_spk: dict[str, list[int]] = {}
    amt_missing = amt_total = 0
    confusions: dict[str, int] = {}
    for n, it in enumerate(items, 1):
        path = __import__("pathlib").Path(args.audio_dir) / it["audio"]
        try:
            tx = await transcribe_cached(path, it["lang"])
        except groq_client.GroqUnavailable as exc:
            print(f"  ASR busy: {exc}; waiting 30s"); await asyncio.sleep(30)
            tx = await transcribe_cached(path, it["lang"])
        if not tx.get("cached"):
            asr_lat.append(tx.get("latency_ms") or 0)
            throttle.wait()
        hyp = tx.get("text", "")
        ref_n, hyp_n = normalize_text(it["reference"]), normalize_text(hyp)
        cer = jiwer.cer(ref_n, hyp_n) if ref_n else 1.0
        miss, tot = amount_token_errors(it["reference"], hyp)
        amt_missing += miss
        amt_total += tot
        for a, b in number_confusions(it["reference"], hyp):
            key = f"{it['lang']}:{a:g}->{b:g}"
            confusions[key] = confusions.get(key, 0) + 1
        messages = P.build_messages(hyp, it["lang"], EVAL_TODAY, EVAL_CONTEXT, settings.prompt_version)
        try:
            raw, info = await groq_client.chat_json(messages, P.PARSE_SCHEMA)
            parse_lat.append(info.latency_ms)
            throttle.wait()
            result = P.apply_guards(P.ParseResult.model_validate(raw), hyp, it["lang"]).model_dump()
        except Exception as exc:
            raw, result = {"entries": []}, P.ParseResult(intent="unclear").model_dump()
            print(f"  parse failed: {exc}")
        s = score_case({**it, "lang": it["lang"]}, result, raw.get("entries", []), hyp)
        scored.append({**s, "lang": it["lang"]})
        cer_by_spk.setdefault(it["speaker"], []).append(int(cer <= 0.15))
        exact_by_spk.setdefault(it["speaker"], []).append(int(s["exact"]))
        rows.append({"audio": it["audio"], "speaker": it["speaker"], "lang": it["lang"], "source": it["source"],
                     "reference": it["reference"], "transcript": hyp, "cer": round(cer, 4), "amount_tokens_missing": miss,
                     "asr_model": tx.get("model"), "final": result, "expected": it["expected"],
                     "score": {k: v for k, v in s.items() if k != "field_checks"}})
        if not s["exact"]:
            err = "asr: number misheard" if miss else ("asr: words" if cer > 0.3 else "parser")
            failures.append({"id": it["audio"], "text": f"REF: {it['reference']} | ASR: {hyp}", "error_type": err,
                             "expected": json.dumps(it["expected"], ensure_ascii=False),
                             "got": json.dumps([{k: e.get(k) for k in ("kind", "amount", "category", "regular_event")} for e in result["entries"]], ensure_ascii=False)})
        print(f"[{n}/{len(items)}] {it['audio']} CER={cer:.2f} {'✓' if s['exact'] else '✗'}", flush=True)

    metrics = aggregate(scored)
    metrics.insert(0, {"name": "amount-token error (ASR)", "value": (amt_missing / amt_total) if amt_total else None,
                       "n": amt_total, "ci": None, "note": "spoken amounts not reproduced in transcript; lower is better"})
    metrics.insert(1, {"name": "clips with CER ≤ 15%", "value": sum(sum(v) for v in cer_by_spk.values()) / len(items),
                       "n": len(items), "ci": cluster_bootstrap(cer_by_spk), "note": f"CI resamples speakers (k={len(cer_by_spk)})"})
    metrics[2]["ci"] = cluster_bootstrap(exact_by_spk) or metrics[2]["ci"]
    for name, vals in (("ASR latency p50", asr_lat), ("ASR latency p95", asr_lat), ("parser latency p50", parse_lat)):
        q = 0.95 if "p95" in name else 0.5
        if vals:
            metrics.append({"name": name, "value": pctl(vals, q), "n": len(vals), "ci": None})
    by_lang = {lang: [m for m in aggregate([s for s in scored if s["lang"] == lang]) if m["name"] in ("utterance exact match", "amount accuracy")]
               for lang in sorted({s["lang"] for s in scored})}
    meta = run_meta("voice (end-to-end)", args.split, items, frozen,
                    {"speakers": len(cer_by_spk), "asr_models": settings.asr_models, "command": "python " + " ".join(sys.argv),
                     # Observed ASR number swaps -> candidates for frontend/src/lib/confusables.ts
                     "number_confusions": dict(sorted(confusions.items(), key=lambda kv: -kv[1]))})
    folder = write_run(meta, metrics, by_lang, rows, failures, args.publish)
    print(f"\nreport: {folder / 'report.md'}")


if __name__ == "__main__":
    asyncio.run(main())
