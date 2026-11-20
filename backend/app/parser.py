"""Transcript -> structured hisaab entries (LLM) + deterministic guards."""
from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from typing import Literal, Optional

from pydantic import BaseModel, Field, ValidationError

from . import groq_client
from .config import BACKEND_DIR, settings
from .numbers import annotate, check_amount, find_numbers, normalize_text

KINDS = [
    "expense", "income", "cash_withdrawal", "cash_deposit", "loan_given", "loan_taken",
    "loan_repaid_to_us", "loan_repaid_by_us", "gift_given", "gift_received",
    "credit_purchase", "credit_payment", "regular_event", "regular_payment",
]
REGULAR_EVENTS = ["skip", "extra", "less", "units", "leave", "half_leave", "advance", "rate_change"]
MODES = ["cash", "upi", "card", "bank"]
RANGES = ["today", "yesterday", "this_week", "this_month", "last_month"]
FIELDS = ["amount", "category", "kind", "member"]


def _nullable(t: str) -> dict:
    return {"type": [t, "null"]}


def _enum_nullable(values: list[str]) -> dict:
    return {"type": ["string", "null"], "enum": [*values, None]}


ENTRY_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "kind": {"type": "string", "enum": KINDS},
        "amount": _nullable("integer"),
        "amount_span": _nullable("string"),
        "qty": _nullable("number"),
        "rate": _nullable("integer"),
        "unit": _nullable("string"),
        "category": _nullable("string"),
        "member": _nullable("string"),
        "person": _nullable("string"),
        "account": _nullable("string"),
        "regular": _nullable("string"),
        "regular_event": _enum_nullable(REGULAR_EVENTS),
        "mode": _enum_nullable(MODES),
        "date_offset_days": {"type": "integer"},
        "occasion": _nullable("string"),
        "note": _nullable("string"),
        "clarify": _nullable("string"),
    },
}
ENTRY_SCHEMA["required"] = list(ENTRY_SCHEMA["properties"].keys())

PARSE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "intent": {"type": "string", "enum": ["log", "correction", "question", "unclear"]},
        "entries": {"type": "array", "items": ENTRY_SCHEMA},
        "correction": {
            "type": "object", "additionalProperties": False,
            "properties": {"present": {"type": "boolean"}, "target_hint": _nullable("string"),
                           "field": _enum_nullable(FIELDS), "new_value": _nullable("string")},
            "required": ["present", "target_hint", "field", "new_value"],
        },
        "question": {
            "type": "object", "additionalProperties": False,
            "properties": {"present": {"type": "boolean"}, "metric": _nullable("string"),
                           "category": _nullable("string"), "range": _enum_nullable(RANGES)},
            "required": ["present", "metric", "category", "range"],
        },
    },
    "required": ["intent", "entries", "correction", "question"],
}


class Entry(BaseModel):
    kind: Literal[tuple(KINDS)]  # type: ignore[valid-type]
    amount: Optional[float] = None
    amount_span: Optional[str] = None
    qty: Optional[float] = None
    rate: Optional[float] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    member: Optional[str] = None
    person: Optional[str] = None
    account: Optional[str] = None
    regular: Optional[str] = None
    regular_event: Optional[Literal[tuple(REGULAR_EVENTS)]] = None  # type: ignore[valid-type]
    mode: Optional[Literal[tuple(MODES)]] = None  # type: ignore[valid-type]
    date_offset_days: int = 0
    occasion: Optional[str] = None
    note: Optional[str] = None
    clarify: Optional[str] = None
    # Filled by guards (not by the model)
    amount_check: str = "none"
    rate_check: str = "none"
    dropped_amount: Optional[float] = None


class Correction(BaseModel):
    present: bool = False
    target_hint: Optional[str] = None
    field: Optional[str] = None
    new_value: Optional[str] = None


class Question(BaseModel):
    present: bool = False
    metric: Optional[str] = None
    category: Optional[str] = None
    range: Optional[str] = None


class ParseResult(BaseModel):
    intent: Literal["log", "correction", "question", "unclear"] = "unclear"
    entries: list[Entry] = Field(default_factory=list)
    correction: Correction = Field(default_factory=Correction)
    question: Question = Field(default_factory=Question)


class ParseContext(BaseModel):
    members: list[str] = Field(default_factory=list)
    regulars: list[dict] = Field(default_factory=list)   # [{"name":..., "category":...}]
    accounts: list[str] = Field(default_factory=list)
    people: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)


DEFAULT_CATEGORIES = [
    "kirana", "sabzi", "doodh", "dawai", "bills", "gas", "help", "travel", "pooja", "family", "fish", "other",
    "seed", "fertiliser", "pesticide", "labour", "irrigation", "machine", "fodder", "market",
    "pension", "interest", "rent", "salary", "crop_sale", "milk_sale", "other_income",
]


@lru_cache(maxsize=8)
def load_prompt(version: str) -> str:
    return (BACKEND_DIR / "prompts" / f"{version}.txt").read_text(encoding="utf-8")


def prompt_hash(version: str) -> str:
    return hashlib.sha256(load_prompt(version).encode("utf-8")).hexdigest()[:12]


def build_messages(transcript: str, lang: str, today: str, ctx: ParseContext, version: str) -> list[dict]:
    annotated, _ = annotate(transcript)
    context = {
        "today": today,
        "speech_language": lang,
        "members": ctx.members[:8],
        "regulars": ctx.regulars[:12],
        "shop_accounts": ctx.accounts[:12],
        "people": ctx.people[:20],
        "category_ids": ctx.categories or DEFAULT_CATEGORIES,
    }
    user = "Household context: " + json.dumps(context, ensure_ascii=False) + "\nTranscript: " + annotated
    return [{"role": "system", "content": load_prompt(version)}, {"role": "user", "content": user}]


def apply_guards(result: ParseResult, transcript: str, lang: str | None = None) -> ParseResult:
    """Deterministic checks: no amount may exist that was not spoken."""
    hits = find_numbers(normalize_text(transcript))
    for e in result.entries:
        e.amount_check = check_amount(e.amount, e.amount_span, transcript, hits, lang)
        if e.amount_check == "not_in_speech":
            e.dropped_amount, e.amount = e.amount, None
            if not e.clarify:
                e.clarify = "amount"
        if e.rate is not None:
            e.rate_check = check_amount(e.rate, None, transcript, hits)
            if e.rate_check == "not_in_speech":
                e.rate = None
                if e.amount is None and not e.clarify:
                    e.clarify = "amount"
        if e.qty is not None and e.qty <= 0:
            e.qty = None
    return result


async def parse(transcript: str, lang: str, today: str, ctx: ParseContext,
                version: str | None = None) -> tuple[ParseResult, dict]:
    version = version or settings.prompt_version
    messages = build_messages(transcript, lang, today, ctx, version)
    last_error = None
    for _ in range(2):  # one retry on validation failure
        raw, info = await groq_client.chat_json(messages, PARSE_SCHEMA)
        try:
            result = ParseResult.model_validate(raw)
            break
        except ValidationError as exc:
            last_error = exc
    else:
        result = ParseResult(intent="unclear")
        info = groq_client.CallInfo(model="none", latency_ms=0)
    result = apply_guards(result, transcript, lang)
    meta = {"model": info.model, "latency_ms": info.latency_ms, "attempts": info.attempts,
            "usage": info.usage, "prompt_version": version, "prompt_hash": prompt_hash(version),
            "validation_error": str(last_error)[:200] if last_error and result.intent == "unclear" else None}
    return result, meta
