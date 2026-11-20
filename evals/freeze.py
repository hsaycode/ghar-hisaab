"""Freeze the test sets: record SHA-256 of the test cases before any prompt tuning.

Test-split runs refuse to start if the cases changed after freezing (unless --allow-unfrozen,
which stamps the report UNFROZEN). Commit MANIFEST.lock.json so reviewers can verify.

  python evals/freeze.py            # freeze text test set (and voice test set if recordings exist)
"""
import json
from datetime import datetime, timezone

from evallib import EVALS, LOCK, load_jsonl, subset_hash

AUDIO = EVALS / "audio"


def main() -> None:
    lock = json.loads(LOCK.read_text(encoding="utf-8")) if LOCK.exists() else {}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    text = [c for c in load_jsonl(EVALS / "cases" / "text_cases.jsonl") if c["split"] == "test"]
    lock["text_test"] = {"sha256": subset_hash(text), "n": len(text), "frozen_at": now}
    recs = load_jsonl(AUDIO / "recordings.jsonl")
    speakers = json.loads((AUDIO / "speakers.json").read_text(encoding="utf-8")) if (AUDIO / "speakers.json").exists() else {}
    if recs and speakers:
        text_ids = {c["id"]: c for c in load_jsonl(EVALS / "cases" / "text_cases.jsonl")}
        labels = {x["case_id"]: x for x in load_jsonl(EVALS / "cases" / "voice_labels.jsonl")}
        items = []
        for r in recs:
            if speakers.get(r["speaker"]) != "test":
                continue
            ref = text_ids.get(r["case_id"], {}).get("text") or labels.get(r["case_id"], {}).get("reference")
            if ref:
                items.append({"audio": r["audio"], "case_id": r["case_id"], "speaker": r["speaker"], "reference": ref})
        lock["voice_test"] = {"sha256": subset_hash(items), "n": len(items), "frozen_at": now}
    LOCK.write_text(json.dumps(lock, indent=2), encoding="utf-8")
    print(json.dumps(lock, indent=2))


if __name__ == "__main__":
    main()
