"""Tests for the eval harness itself (so the scoring is trustworthy)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from evallib import aggregate, final_amount, match, score_case, wilson  # noqa: E402


def entry(**kw):
    base = {"kind": "expense", "amount": None, "amount_span": None, "qty": None, "rate": None, "category": None,
            "regular_event": None, "member": None, "date_offset_days": 0, "mode": None, "amount_check": "derived", "dropped_amount": None}
    base.update(kw)
    return base


def test_final_amount_multiplies():
    assert final_amount(entry(qty=3, rate=400)) == 1200
    assert final_amount(entry(kind="regular_event", amount=5)) is None


def test_match_is_order_independent():
    exp = [{"kind": "expense", "amount": 60, "category": ["sabzi"]}, {"kind": "expense", "amount": 420, "category": ["dawai"]}]
    pred = [entry(amount=420, category="dawai"), entry(amount=60, category="sabzi")]
    assert sorted(match(exp, pred)) == [(0, 1), (1, 0)]


def test_score_exact_and_made_up():
    case = {"lang": "hi", "expected": {"intent": "log", "entries": [{"kind": "expense", "amount": 60, "category": ["sabzi"]}]}}
    final = {"intent": "log", "entries": [entry(amount=60, amount_span="saath", category="sabzi")]}
    raw = [{"kind": "expense", "amount": 60, "amount_span": "saath"}, {"kind": "expense", "amount": 999, "amount_span": "kuch"}]
    s = score_case(case, final, raw, "sabzi saath rupaye")
    assert s["exact"] and s["made_up_raw"] == 1 and s["raw_amounts"] == 2


def test_extra_entry_breaks_exact():
    case = {"lang": "hi", "expected": {"intent": "log", "entries": [{"kind": "expense", "amount": 60}]}}
    final = {"intent": "log", "entries": [entry(amount=60), entry(amount=60)]}
    assert not score_case(case, final, [], "saath")["exact"]


def test_wilson_bounds():
    lo, hi = wilson(36, 40)
    assert 0.76 < lo < 0.78 and 0.96 < hi < 0.97


def test_aggregate_has_core_metrics():
    case = {"lang": "hi", "expected": {"intent": "log", "entries": [{"kind": "expense", "amount": 50}]}}
    s = score_case(case, {"intent": "log", "entries": [entry(amount=50)]}, [], "pachaas")
    names = [m["name"] for m in aggregate([s])]
    assert "utterance exact match" in names and "made-up amounts (after guard)" in names
