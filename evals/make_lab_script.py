"""Export scripted phrases for the in-app Recording Lab (frontend/public/evals/lab_script.json)."""
import json

from evallib import EVALS, PUBLIC, load_jsonl


def main() -> None:
    cases = load_jsonl(EVALS / "cases" / "text_cases.jsonl")
    script = [{"id": c["id"], "lang": c["lang"], "text": c["text"], "split": c["split"]} for c in cases]
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (PUBLIC / "lab_script.json").write_text(json.dumps(script, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {len(script)} phrases -> {PUBLIC / 'lab_script.json'}")


if __name__ == "__main__":
    main()
