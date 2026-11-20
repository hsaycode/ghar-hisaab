"""Shared eval utilities: hashing, freezing, matching, metrics, confidence intervals, reports."""
from __future__ import annotations

import hashlib
import itertools
import json
import math
import platform
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVALS = ROOT / "evals"
sys.path.insert(0, str(ROOT / "backend"))

from app import parser as P  # noqa: E402
from app.config import settings  # noqa: E402
from app.numbers import check_amount  # noqa: E402

LOCK = EVALS / "MANIFEST.lock.json"
RUNS = EVALS / "runs"
CACHE = EVALS / ".cache"
PUBLIC = ROOT / "frontend" / "public" / "evals"

# Fixed household context used for every eval call (mirrors the demo house).
EVAL_CONTEXT = P.ParseContext(
    members=["Dadi", "Dadaji"],
    regulars=[{"name": "Doodhwala", "category": "doodh"}, {"name": "Kamla", "category": "help"},
              {"name": "Press wala", "category": "help"}, {"name": "Akhbaar", "category": "bills"}],
    accounts=["Gupta Kirana"],
    people=["Ramesh", "Sharma ji"],
    categories=P.DEFAULT_CATEGORIES,
)
EVAL_TODAY = "2026-11-20"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def code_hash() -> str:
    parts = [(ROOT / "backend" / "app" / f).read_text(encoding="utf-8") for f in ("parser.py", "numbers.py", "asr.py")]
    parts.append(P.load_prompt(settings.prompt_version))
    return sha256_text("\n".join(parts))


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def subset_hash(cases: list[dict]) -> str:
    return sha256_text("\n".join(json.dumps(c, ensure_ascii=False, sort_keys=True) for c in cases))


def check_frozen(name: str, cases: list[dict], allow_unfrozen: bool) -> bool:
    """Test-split runs must match the frozen hash. Returns True if frozen & matching."""
    lock = json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {}
    want = lock.get(name, {}).get("sha256")
    got = subset_hash(cases)
    if want == got:
        return True
    msg = f"[freeze] {name}: test cases {'not frozen' if not want else 'CHANGED since freeze'} (sha {got[:12]})."
    if not allow_unfrozen:
        raise SystemExit(msg + " Run evals/freeze.py first, or pass --allow-unfrozen (report will be marked UNFROZEN).")
    print(msg + " Continuing as UNFROZEN.")
    return False


# ---------------------------------------------------------------- statistics
def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float] | None:
    if n == 0:
        return None
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def cluster_bootstrap(values_by_cluster: dict[str, list[int]], iters: int = 2000, seed: int = 7) -> tuple[float, float] | None:
    """95% CI resampling clusters (speakers) -- clips from one speaker are correlated."""
    clusters = [v for v in values_by_cluster.values() if v]
    if len(clusters) < 2:
        return None
    rnd = random.Random(seed)
    stats = []
    for _ in range(iters):
        sample = [rnd.choice(clusters) for _ in clusters]
        flat = [x for c in sample for x in c]
        stats.append(sum(flat) / len(flat))
    stats.sort()
    return (stats[int(0.025 * iters)], stats[int(0.975 * iters)])


def pctl(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(round(q * (len(s) - 1))))]


# ---------------------------------------------------------------- matching
def final_amount(e: dict) -> float | None:
    """Apply the app's rule: amount, else qty x rate (the app multiplies, never the model)."""
    if e.get("kind") == "regular_event":
        return None
    if e.get("amount") is not None:
        return float(e["amount"])
    if e.get("qty") is not None and e.get("rate") is not None:
        return round(float(e["qty"]) * float(e["rate"]), 2)
    return None


def _norm(s: str | None) -> str:
    return (s or "").strip().lower().replace(" ", "")


def field_checks(exp: dict, pred: dict) -> dict[str, bool]:
    """Per-field correctness for one expected/predicted pair (only fields the case specifies)."""
    out = {"kind": exp["kind"] == pred.get("kind")}
    if exp["kind"] != "regular_event":
        ea, pa = exp.get("amount"), final_amount(pred)
        out["amount"] = (ea is None and pa is None) or (ea is not None and pa is not None and abs(ea - pa) < 1e-6)
    if "category" in exp:
        out["category"] = pred.get("category") in exp["category"]
    if "regular_event" in exp:
        out["regular_event"] = pred.get("regular_event") == exp["regular_event"]
    if "date" in exp:
        out["date"] = int(pred.get("date_offset_days") or 0) == exp["date"]
    if "mode" in exp:
        out["mode"] = pred.get("mode") == exp["mode"]
    if "member" in exp:
        out["member"] = (pred.get("member") in (None, "")) if exp["member"] == "-" else _norm(exp["member"]) in _norm(pred.get("member"))
    return out


def _cost(exp: dict, pred: dict) -> int:
    c = field_checks(exp, pred)
    return (0 if c["kind"] else 3) + (0 if c.get("amount", True) else 2) + (0 if c.get("category", True) else 1) \
        + (0 if c.get("regular_event", True) else 1)


def match(expected: list[dict], predicted: list[dict]) -> list[tuple[int, int]]:
    """Optimal assignment (Hungarian-equivalent by exhaustive search for small n, greedy beyond 7)."""
    n, m = len(expected), len(predicted)
    if not n or not m:
        return []
    if max(n, m) <= 7:
        best, best_pairs = None, []
        if n <= m:
            for perm in itertools.permutations(range(m), n):
                cost = sum(_cost(expected[i], predicted[j]) for i, j in enumerate(perm))
                if best is None or cost < best:
                    best, best_pairs = cost, list(enumerate(perm))
        else:
            for perm in itertools.permutations(range(n), m):
                cost = sum(_cost(expected[i], predicted[j]) for j, i in enumerate(perm))
                if best is None or cost < best:
                    best, best_pairs = cost, [(i, j) for j, i in enumerate(perm)]
        return best_pairs
    pairs, used = [], set()
    for i, e in enumerate(expected):
        j = min((j for j in range(m) if j not in used), key=lambda j: _cost(e, predicted[j]), default=None)
        if j is not None:
            used.add(j)
            pairs.append((i, j))
    return pairs


def score_case(case: dict, result: dict, raw_entries: list[dict], source_text: str) -> dict:
    """Score one utterance. `result` is post-guard ParseResult dict; raw_entries are pre-guard model entries."""
    exp = case["expected"]
    pred = result.get("entries", [])
    pairs = match(exp["entries"], pred)
    checks = [field_checks(exp["entries"][i], pred[j]) for i, j in pairs]
    tp = sum(1 for c in checks if c["kind"] and c.get("amount", True))
    exact = (result.get("intent") == exp["intent"] and len(pred) == len(exp["entries"])
             and len(pairs) == len(exp["entries"]) and all(all(c.values()) for c in checks))
    # Made-up amounts in the raw model output (before guards), judged against the source text.
    raw_amounts = [e.get("amount") for e in raw_entries if e.get("amount") is not None]
    made_up = [a for e, a in ((e, e.get("amount")) for e in raw_entries) if a is not None
               and check_amount(a, e.get("amount_span"), source_text, lang=case.get("lang")) == "not_in_speech"]
    exp_amounts = [e for e in exp["entries"] if e["kind"] != "regular_event" and e.get("amount") is not None]
    amount_ok = sum(1 for (i, j), c in zip(pairs, checks) if exp["entries"][i] in exp_amounts and c.get("amount"))
    return {
        "intent_ok": result.get("intent") == exp["intent"],
        "n_exp": len(exp["entries"]), "n_pred": len(pred), "tp": tp, "exact": exact,
        "field_checks": checks, "amount_total": len(exp_amounts), "amount_ok": amount_ok,
        "raw_amounts": len(raw_amounts), "made_up_raw": len(made_up),
        "made_up_final": sum(1 for e in pred if e.get("amount") is not None and e.get("amount_check") == "not_in_speech"),
        "dropped": sum(1 for e in pred if e.get("dropped_amount") is not None),
    }


def aggregate(scored: list[dict]) -> list[dict]:
    def m(name, k, n, note=None):
        return {"name": name, "value": (k / n) if n else None, "n": n, "ci": wilson(k, n), "note": note}
    n_utt = len(scored)
    tp = sum(s["tp"] for s in scored)
    n_pred = sum(s["n_pred"] for s in scored)
    n_exp = sum(s["n_exp"] for s in scored)
    field = {}
    for s in scored:
        for c in s["field_checks"]:
            for f, ok in c.items():
                k, n = field.get(f, (0, 0))
                field[f] = (k + int(ok), n + 1)
    out = [
        m("utterance exact match", sum(s["exact"] for s in scored), n_utt, "every entry fully right, nothing extra"),
        m("intent accuracy", sum(s["intent_ok"] for s in scored), n_utt),
        m("entry precision", tp, n_pred, "kind+amount right / predicted entries"),
        m("entry recall", tp, n_exp, "kind+amount right / expected entries"),
        m("amount accuracy", sum(s["amount_ok"] for s in scored), sum(s["amount_total"] for s in scored)),
    ]
    for f in ("kind", "category", "regular_event", "member", "date", "mode"):
        if f in field:
            out.append(m(f"{f} accuracy (matched)", *field[f]))
    raw_n = sum(s["raw_amounts"] for s in scored)
    mu = sum(s["made_up_raw"] for s in scored)
    out.append(m("made-up amounts (model, before guard)", mu, raw_n, "lower is better; guard removes these"))
    out.append(m("made-up amounts (after guard)", sum(s["made_up_final"] for s in scored), raw_n,
                 f"0 observed => upper 95% bound ≈ {3 / raw_n:.1%} (rule of three)" if raw_n else None))
    return out


def run_meta(layer: str, split: str, cases: list[dict], frozen: bool, extra: dict | None = None) -> dict:
    return {
        "run_id": datetime.now().strftime("%Y%m%d-%H%M%S") + f"-{layer}-{split}",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "layer": layer, "split": split, "frozen": frozen, "n_cases": len(cases),
        "cases_hash": subset_hash(cases), "code_hash": code_hash(),
        "prompt_version": settings.prompt_version, "prompt_hash": P.prompt_hash(settings.prompt_version),
        "python": platform.python_version(), "eval_today": EVAL_TODAY, **(extra or {}),
    }


class Throttle:
    """Simple rate limiter for Groq free-tier limits."""

    def __init__(self, rpm: float):
        self.gap = 60.0 / rpm if rpm > 0 else 0
        self.last = 0.0

    def wait(self):
        now = time.time()
        if now - self.last < self.gap:
            time.sleep(self.gap - (now - self.last))
        self.last = time.time()


def write_run(meta: dict, metrics: list[dict], by_lang: dict, rows: list[dict], failures: list[dict], publish: bool) -> Path:
    folder = RUNS / meta["run_id"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "predictions.jsonl").write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n", encoding="utf-8")
    summary = {**meta, "metrics": metrics, "by_lang": by_lang, "failures": failures[:15]}
    (folder / "metrics.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (folder / "report.md").write_text(render_report(summary), encoding="utf-8")
    if publish:
        PUBLIC.mkdir(parents=True, exist_ok=True)
        latest_path = PUBLIC / "latest.json"
        latest = json.loads(latest_path.read_text(encoding="utf-8")) if latest_path.exists() else []
        latest = [r for r in latest if not (r["layer"] == meta["layer"] and r["split"] == meta["split"])]
        latest.append(summary)
        latest_path.write_text(json.dumps(latest, ensure_ascii=False, indent=2), encoding="utf-8")
    return folder


def _pct(v):
    return "—" if v is None else f"{v * 100:.1f}%"


def render_report(s: dict) -> str:
    lines = [f"# Eval run `{s['run_id']}`", "",
             f"- Layer: **{s['layer']}** · split: **{s['split']}** · {'FROZEN ✓' if s['frozen'] else '**UNFROZEN**'}",
             f"- Created: {s['created_at']} · n = {s['n_cases']}",
             f"- Model(s): {s.get('models_used', s.get('model', '—'))}",
             f"- Prompt: {s['prompt_version']} (`{s['prompt_hash']}`) · code sha256 `{s['code_hash'][:16]}` · cases sha256 `{s['cases_hash'][:16]}`",
             f"- Reproduce: `{s.get('command', '')}`", "", "## Metrics", "", "| Metric | Value | 95% CI | n |", "|---|---|---|---|"]
    for m in s["metrics"]:
        val = f"{m['value']} ms" if "latency" in m["name"] else _pct(m["value"])
        ci = f"{_pct(m['ci'][0])}–{_pct(m['ci'][1])}" if m.get("ci") else "—"
        lines.append(f"| {m['name']}{' — ' + m['note'] if m.get('note') else ''} | {val} | {ci} | {m.get('n', '')} |")
    if s.get("by_lang"):
        lines += ["", "## By language", ""]
        names = [m["name"] for m in next(iter(s["by_lang"].values()))]
        lines += ["| Lang | " + " | ".join(names) + " |", "|---|" + "---|" * len(names)]
        for lang, ms in s["by_lang"].items():
            lines.append(f"| {lang} | " + " | ".join(f"{_pct(m['value'])} (n={m['n']})" for m in ms) + " |")
    if s.get("number_confusions"):
        lines += ["", "## Observed number confusions (spoken -> transcribed)", "",
                  "Add recurring pairs to `frontend/src/lib/confusables.ts`.", ""]
        lines += [f"- `{k}` × {v}" for k, v in s["number_confusions"].items()]
    if s.get("failures"):
        lines += ["", "## Failure gallery", ""]
        for f in s["failures"]:
            lines += [f"- **{f['id']}** [{f['error_type']}] “{f['text']}”", f"  - expected: `{f['expected']}`", f"  - got: `{f['got']}`"]
    lines += ["", "Per-case raw outputs: `predictions.jsonl` in this folder."]
    return "\n".join(lines) + "\n"
