# Eval run `20261120-214147-parser (text)-test`

- Layer: **parser (text)** · split: **test** · FROZEN ✓
- Created: 2026-11-20T16:11:47+00:00 · n = 59
- Model(s): {'openai/gpt-oss-120b': 59}
- Prompt: parser_v2 (`b85fb753f299`) · code sha256 `ede5563c6b2558ec` · cases sha256 `2585c257eb755bd0`
- Reproduce: `python run_parse_eval.py --split test --rpm 3 --publish`

## Metrics

| Metric | Value | 95% CI | n |
|---|---|---|---|
| utterance exact match — every entry fully right, nothing extra | 89.8% | 79.5%–95.3% | 59 |
| intent accuracy | 96.6% | 88.5%–99.1% | 59 |
| entry precision — kind+amount right / predicted entries | 92.4% | 83.5%–96.7% | 66 |
| entry recall — kind+amount right / expected entries | 95.3% | 87.1%–98.4% | 64 |
| amount accuracy | 96.2% | 87.0%–98.9% | 52 |
| kind accuracy (matched) | 98.4% | 91.7%–99.7% | 64 |
| category accuracy (matched) | 97.6% | 87.4%–99.6% | 41 |
| regular_event accuracy (matched) | 100.0% | 74.1%–100.0% | 11 |
| member accuracy (matched) | 100.0% | 34.2%–100.0% | 2 |
| date accuracy (matched) | 100.0% | 43.8%–100.0% | 3 |
| mode accuracy (matched) | 100.0% | 34.2%–100.0% | 2 |
| made-up amounts (model, before guard) — lower is better; guard removes these | 1.9% | 0.3%–10.1% | 52 |
| made-up amounts (after guard) — 0 observed => upper 95% bound ≈ 5.8% (rule of three) | 0.0% | 0.0%–6.9% | 52 |
| parser latency p50 | 1782 ms | — | 59 |
| parser latency p95 | 2938 ms | — | 59 |

## By language

| Lang | utterance exact match | amount accuracy | kind accuracy (matched) |
|---|---|---|---|
| bn | 100.0% (n=4) | 100.0% (n=5) | 100.0% (n=5) |
| en | 80.0% (n=5) | 80.0% (n=5) | 100.0% (n=6) |
| hi | 89.5% (n=38) | 96.7% (n=30) | 97.4% (n=38) |
| mr | 100.0% (n=4) | 100.0% (n=4) | 100.0% (n=5) |
| ta | 75.0% (n=4) | 100.0% (n=4) | 100.0% (n=5) |
| te | 100.0% (n=4) | 100.0% (n=4) | 100.0% (n=5) |

## Failure gallery

- **hi-015** [parser: kind] “शर्मा जी की बेटी की शादी में ग्यारह सौ शगुन दिए”
  - expected: `{"intent": "log", "entries": [{"kind": "gift_given", "amount": 1100}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 1100.0, "qty": null, "rate": null, "category": "family", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-027** [parser: wrong intent] “नहीं, दवाई दो सौ चालीस की थी”
  - expected: `{"intent": "correction", "entries": []}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 240.0, "qty": null, "rate": null, "category": "dawai", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-036** [parser: amount] “dawai chaar sau bees ki aur auto mein tees diye”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 420, "category": ["dawai"]}, {"kind": "expense", "amount": 30, "category": ["travel"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 420.0, "qty": null, "rate": null, "category": "dawai", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}, {"kind": "expense", "amount": 23.0, "qty": null, "rate": null, "category": "travel", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-053** [parser: wrong intent] “nahi nahi, sabzi assi ki thi”
  - expected: `{"intent": "correction", "entries": []}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 80.0, "qty": null, "rate": null, "category": "sabzi", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **en-003** [parser: made-up amount] “Gave fifteen rupees at the temple”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 15, "category": ["pooja"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": null, "qty": null, "rate": null, "category": "pooja", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **ta-005** [parser: category] “பூ, தேங்காய் 80 ரூபாய்”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 80, "category": ["pooja"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 80.0, "qty": null, "rate": null, "category": "other", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`

Per-case raw outputs: `predictions.jsonl` in this folder.
