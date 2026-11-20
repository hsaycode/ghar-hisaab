"""L2 eval: text -> entries (parser LLM + guards), no audio involved.

  python evals/run_parse_eval.py --split dev            # iterate prompts on dev only
  python evals/run_parse_eval.py --split test --publish # milestone run on the frozen test set

Every call's raw model output, post-guard result, latency and model are written to
evals/runs/<run_id>/predictions.jsonl so every metric can be recomputed by anyone.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

from evallib import (CACHE, EVAL_CONTEXT, EVAL_TODAY, EVALS, Throttle, aggregate, check_frozen, load_jsonl, pctl,
                     run_meta, score_case, sha256_text, write_run)
from app import groq_client
from app import parser as P
from app.config import settings


def classify_error(case: dict, score: dict) -> str:
    if not score["intent_ok"]:
        return "parser: wrong intent"
    if score["made_up_raw"]:
        return "parser: made-up amount"
    if score["n_pred"] != score["n_exp"]:
        return "parser: wrong split/merge"
    for c in score["field_checks"]:
        for f, ok in c.items():
            if not ok:
                return f"parser: {f}"
    return "other"


async def run_case(case: dict, use_cache: bool) -> dict:
    messages = P.build_messages(case["text"], case["lang"], EVAL_TODAY, EVAL_CONTEXT, settings.prompt_version)
    key = sha256_text(json.dumps([messages, settings.llm_models], ensure_ascii=False))
    cache_file = CACHE / "parse" / f"{key}.json"
    if use_cache and cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8")) | {"cached": True}
    t0 = time.perf_counter()
    raw, info, err = None, None, None
    for _ in range(2):
        try:
            raw, info = await groq_client.chat_json(messages, P.PARSE_SCHEMA)
            P.ParseResult.model_validate(raw)
            break
        except groq_client.GroqUnavailable as exc:
            err = f"unavailable: {exc}"
            await asyncio.sleep(20)
        except Exception as exc:  # validation or bad request
            err = f"{type(exc).__name__}: {str(exc)[:200]}"
    latency = int((time.perf_counter() - t0) * 1000)
    out = {"raw": raw, "model": info.model if info else None, "latency_ms": latency, "error": err if raw is None else None,
           "attempts": info.attempts if info else []}
    if raw is not None:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return out


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["dev", "test", "all"], default="dev")
    ap.add_argument("--lang", default=None)
    ap.add_argument("--rpm", type=float, default=3.0, help="requests/minute (free tier: ~8K tokens/min on gpt-oss-120b)")
    ap.add_argument("--no-cache", action="store_true")
    ap.add_argument("--publish", action="store_true", help="copy summary to frontend/public/evals/latest.json")
    ap.add_argument("--allow-unfrozen", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    cases = load_jsonl(EVALS / "cases" / "text_cases.jsonl")
    if args.split != "all":
        cases = [c for c in cases if c["split"] == args.split]
    frozen = True
    if args.split in ("test", "all"):
        frozen = check_frozen("text_test", [c for c in cases if c["split"] == "test"], args.allow_unfrozen)
    if args.lang:
        cases = [c for c in cases if c["lang"] == args.lang]
    if args.limit:
        cases = cases[: args.limit]
    if not settings.groq_api_key:
        raise SystemExit("GROQ_API_KEY missing (backend/.env)")

    throttle = Throttle(args.rpm)
    rows, scored, failures, latencies, models = [], [], [], [], {}
    for i, case in enumerate(cases, 1):
        cache_file_exists = False
        res = await run_case(case, use_cache=not args.no_cache)
        if not res.get("cached"):
            throttle.wait()
        else:
            cache_file_exists = True
        raw = res["raw"] or {"intent": "unclear", "entries": [], "correction": {"present": False}, "question": {"present": False}}
        try:
            result = P.apply_guards(P.ParseResult.model_validate(raw), case["text"], case["lang"]).model_dump()
        except Exception:
            result = P.ParseResult(intent="unclear").model_dump()
        s = score_case(case, result, raw.get("entries", []), case["text"])
        scored.append({**s, "lang": case["lang"]})
        if not res.get("cached") and res["latency_ms"]:
            latencies.append(res["latency_ms"])
        if res.get("model"):
            models[res["model"]] = models.get(res["model"], 0) + 1
        row = {"id": case["id"], "lang": case["lang"], "group": case["group"], "text": case["text"], "expected": case["expected"],
               "raw_model_output": res["raw"], "final": result, "score": {k: v for k, v in s.items() if k != "field_checks"},
               "field_checks": s["field_checks"], "model": res.get("model"), "latency_ms": res["latency_ms"],
               "error": res.get("error"), "cached": cache_file_exists}
        rows.append(row)
        if not s["exact"]:
            failures.append({"id": case["id"], "text": case["text"], "error_type": classify_error(case, s),
                             "expected": json.dumps(case["expected"], ensure_ascii=False),
                             "got": json.dumps({"intent": result["intent"], "entries": [{k: e.get(k) for k in ("kind", "amount", "qty", "rate", "category", "regular_event", "member", "date_offset_days", "mode")} for e in result["entries"]]}, ensure_ascii=False)})
        print(f"[{i}/{len(cases)}] {case['id']} {'✓' if s['exact'] else '✗'} {res.get('model') or res.get('error')}", flush=True)

    metrics = aggregate(scored)
    if latencies:
        metrics.append({"name": "parser latency p50", "value": pctl(latencies, 0.5), "n": len(latencies), "ci": None})
        metrics.append({"name": "parser latency p95", "value": pctl(latencies, 0.95), "n": len(latencies), "ci": None})
    by_lang = {}
    for lang in sorted({s["lang"] for s in scored}):
        sub = aggregate([s for s in scored if s["lang"] == lang])
        by_lang[lang] = [m for m in sub if m["name"] in ("utterance exact match", "amount accuracy", "kind accuracy (matched)")]
    meta = run_meta("parser (text)", args.split, cases, frozen,
                    {"models_used": models, "command": "python " + " ".join(sys.argv)})
    folder = write_run(meta, metrics, by_lang, rows, failures, args.publish)
    print(f"\nreport: {folder / 'report.md'}")
    for m in metrics:
        v = m["value"]
        print(f"  {m['name']:<42} {('%.1f%%' % (v * 100)) if isinstance(v, float) and 'latency' not in m['name'] else v}  (n={m['n']})")


if __name__ == "__main__":
    asyncio.run(main())
