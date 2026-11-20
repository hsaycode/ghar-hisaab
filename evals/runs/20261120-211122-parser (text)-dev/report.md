# Eval run `20261120-211122-parser (text)-dev`

- Layer: **parser (text)** · split: **dev** · FROZEN ✓
- Created: 2026-11-20T15:41:22+00:00 · n = 30
- Model(s): {'openai/gpt-oss-120b': 30}
- Prompt: parser_v1 (`0001d83573fe`) · code sha256 `aea2b414dc32aa68` · cases sha256 `512566451a3e5e43`
- Reproduce: `python run_parse_eval.py --split dev --rpm 3 --publish`

## Metrics

| Metric | Value | 95% CI | n |
|---|---|---|---|
| utterance exact match — every entry fully right, nothing extra | 80.0% | 62.7%–90.5% | 30 |
| intent accuracy | 100.0% | 88.6%–100.0% | 30 |
| entry precision — kind+amount right / predicted entries | 90.3% | 75.1%–96.7% | 31 |
| entry recall — kind+amount right / expected entries | 90.3% | 75.1%–96.7% | 31 |
| amount accuracy | 92.3% | 75.9%–97.9% | 26 |
| kind accuracy (matched) | 93.5% | 79.3%–98.2% | 31 |
| category accuracy (matched) | 89.5% | 68.6%–97.1% | 19 |
| regular_event accuracy (matched) | 75.0% | 30.1%–95.4% | 4 |
| member accuracy (matched) | 100.0% | 20.7%–100.0% | 1 |
| date accuracy (matched) | 100.0% | 43.8%–100.0% | 3 |
| mode accuracy (matched) | 100.0% | 20.7%–100.0% | 1 |
| made-up amounts (model, before guard) — lower is better; guard removes these | 0.0% | 0.0%–13.3% | 25 |
| made-up amounts (after guard) — 0 observed => upper 95% bound ≈ 12.0% (rule of three) | 0.0% | 0.0%–13.3% | 25 |
| parser latency p50 | 1600 ms | — | 30 |
| parser latency p95 | 2507 ms | — | 30 |

## By language

| Lang | utterance exact match | amount accuracy | kind accuracy (matched) |
|---|---|---|---|
| bn | 50.0% (n=2) | 100.0% (n=1) | 100.0% (n=2) |
| en | 100.0% (n=3) | 100.0% (n=3) | 100.0% (n=3) |
| hi | 73.7% (n=19) | 87.5% (n=16) | 90.0% (n=20) |
| mr | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |
| ta | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |
| te | 100.0% (n=2) | 100.0% (n=2) | 100.0% (n=2) |

## Failure gallery

- **hi-007** [parser: category] “सात रुपये की टॉफ़ी ली”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 7, "category": ["other", "kirana"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 7.0, "qty": null, "rate": null, "category": null, "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-010** [parser: amount] “दो किलो प्याज़ अस्सी का”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 80, "category": ["sabzi"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": null, "qty": 2.0, "rate": 80.0, "category": "sabzi", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-019** [parser: kind] “गुप्ता किराना वाले को दो हज़ार चुका दिए”
  - expected: `{"intent": "log", "entries": [{"kind": "credit_payment", "amount": 2000}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 2000.0, "qty": null, "rate": null, "category": "kirana", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **hi-025** [parser: category] “कल दो सौ का पेट्रोल डलवाया”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 200, "category": ["travel"], "date": -1}]}`
  - got: `{"intent": "log", "entries": [{"kind": "expense", "amount": 200.0, "qty": null, "rate": null, "category": "gas", "regular_event": null, "member": null, "date_offset_days": -1, "mode": null}]}`
- **hi-037** [parser: kind] “dhai sau ka doodh”
  - expected: `{"intent": "log", "entries": [{"kind": "expense", "amount": 250, "category": ["doodh"]}]}`
  - got: `{"intent": "log", "entries": [{"kind": "regular_event", "amount": 250.0, "qty": null, "rate": null, "category": "doodh", "regular_event": null, "member": null, "date_offset_days": 0, "mode": null}]}`
- **bn-004** [parser: regular_event] “আজ দুধওয়ালা আসেনি”
  - expected: `{"intent": "log", "entries": [{"kind": "regular_event", "amount": null, "regular_event": "skip"}]}`
  - got: `{"intent": "log", "entries": [{"kind": "regular_event", "amount": null, "qty": null, "rate": null, "category": null, "regular_event": "leave", "member": null, "date_offset_days": 0, "mode": null}]}`

Per-case raw outputs: `predictions.jsonl` in this folder.
