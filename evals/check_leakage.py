"""Fail if any test-case phrase (or a long chunk of it) appears in the parser prompts.

Prevents the classic mistake of tuning few-shot examples on the test set.
"""
import sys

from evallib import EVALS, ROOT, load_jsonl
from app.numbers import normalize_text


def chunks(s: str, n: int = 4):
    words = s.split()
    for i in range(0, max(1, len(words) - n + 1)):
        yield " ".join(words[i:i + n])


def main() -> int:
    prompts = {p.name: normalize_text(p.read_text(encoding="utf-8")) for p in (ROOT / "backend" / "prompts").glob("*.txt")}
    cases = [c for c in load_jsonl(EVALS / "cases" / "text_cases.jsonl") if c["split"] == "test"]
    leaks = []
    for c in cases:
        norm = normalize_text(c["text"])
        for name, ptxt in prompts.items():
            if norm in ptxt or any(len(ch) > 12 and ch in ptxt for ch in chunks(norm)):
                leaks.append((c["id"], name, c["text"]))
    if leaks:
        for cid, name, text in leaks:
            print(f"LEAK {cid} in {name}: {text}")
        return 1
    print(f"OK: no test phrase from {len(cases)} test cases appears in {len(prompts)} prompt file(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
