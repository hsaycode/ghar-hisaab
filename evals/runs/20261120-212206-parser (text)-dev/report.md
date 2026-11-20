# Eval run `20261120-212206-parser (text)-dev`

- Layer: **parser (text)** · split: **dev** · FROZEN ✓
- Created: 2026-11-20T15:52:06+00:00 · n = 30
- Model(s): {'openai/gpt-oss-120b': 30}
- Prompt: parser_v2 (`b85fb753f299`) · code sha256 `ede5563c6b2558ec` · cases sha256 `512566451a3e5e43`
- Reproduce: `python run_parse_eval.py --split dev --rpm 3 --publish`

## Metrics

| Metric | Value | 95% CI | n |
|---|---|---|---|
| utterance exact match — every entry fully right, nothing extra | 96.7% | 83.3%–99.4% | 30 |
| intent accuracy | 100.0% | 88.6%–100.0% | 30 |
| entry precision — kind+amount right / predicted entries | 100.0% | 89.0%–100.0% | 31 |
| entry recall — kind+amount right / expected entries | 100.0% | 89.0%–100.0% | 31 |
| amount accuracy | 100.0% | 87.1%–100.0% | 26 |
| kind accuracy (matched) | 100.0% | 89.0%–100.0% | 31 |
| category accuracy (matched) | 100.0% | 83.2%–100.0% | 19 |
| regular_event accuracy (matched) | 75.0% | 30.1%–95.4% | 4 |
| member accuracy (matched) | 100.0% | 20.7%–100.0% | 1 |
| date accuracy (matched) | 100.0% | 43.8%–100.0% | 3 |
| mode accuracy (matched) | 100.0% | 20.7%–100.0% | 1 |
| made-up amounts (model, before guard) — lower is better; guard removes these | 0.0% | 0.0%–12.9% | 26 |
| made-up amounts (after guard) — 0 observed => upper 95% bound ≈ 11.5% (rule of three) | 0.0% | 0.0%–12.9% | 26 |
| parser latency p50 | 1711 ms | — | 30 |
| parser latency p95 | 3388 ms | — | 30 |

## By language

| Lang | utterance exact match | amount accuracy | kind accuracy (matched) |
|---|---|---|---|
| bn | 100.0% (n=2) | 100.0% (n=1) | 100.0% (n=2) |
| en | 100.0% (n=3) | 100.0% (n=3) | 100.0% (n=3) |
| hi | 94.7% (n=19) | 100.0% (n=16) | 100.0% (n=20) |
| mr | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |
| ta | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |
| te | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |

## Failure gallery

- **hi-022** [parser: regular_event] “कमला आज काम पर नहीं आई”
  - expected: `{"intent": "log", "entries": [{"kind": "regular_event", "amount": null, "regular_event": "leave"}]}`
  - got: `{"intent": "log", "entries": [{"kind": "regular_event", "amount": null, "qty": null, "rate": null, "category": null, "regular_event": "skip", "member": null, "date_offset_days": 0, "mode": null}]}`

Per-case raw outputs: `predictions.jsonl` in this folder.
