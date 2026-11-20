"""API tests with Groq mocked (no network)."""
import pytest
from fastapi.testclient import TestClient

from app import groq_client, main, parser


@pytest.fixture
def client(monkeypatch):
    async def fake_models(force=False):
        return set()

    monkeypatch.setattr(groq_client, "available_models", fake_models)
    return TestClient(main.app)


def _entry(**kw):
    base = {k: None for k in parser.ENTRY_SCHEMA["properties"]}
    base.update(kind="expense", date_offset_days=0)
    base.update(kw)
    return base


def _result(entries, intent="log"):
    return {"intent": intent, "entries": entries,
            "correction": {"present": False, "target_hint": None, "field": None, "new_value": None},
            "question": {"present": False, "metric": None, "category": None, "range": None}}


def test_parse_drops_invented_amount(client, monkeypatch):
    async def fake_chat(messages, schema, schema_name="hisaab"):
        assert "[=60]" in messages[1]["content"]
        return _result([
            _entry(amount=60, amount_span="saath", category="sabzi"),
            _entry(amount=100000, amount_span="ek lakh", category="other"),   # not spoken
        ]), groq_client.CallInfo(model="mock", latency_ms=5)

    monkeypatch.setattr(groq_client, "chat_json", fake_chat)
    r = client.post("/api/parse", json={"transcript": "sabzi saath rupaye", "lang": "hi"})
    assert r.status_code == 200
    entries = r.json()["result"]["entries"]
    assert entries[0]["amount"] == 60 and entries[0]["amount_check"] == "derived"
    assert entries[1]["amount"] is None and entries[1]["dropped_amount"] == 100000
    assert entries[1]["amount_check"] == "not_in_speech"


def test_parse_quota_returns_429(client, monkeypatch):
    async def busy(*a, **k):
        raise groq_client.GroqUnavailable("busy", quota=True)

    monkeypatch.setattr(groq_client, "chat_json", busy)
    r = client.post("/api/parse", json={"transcript": "sabzi saath", "lang": "hi"})
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "quota"


def test_transcribe_rejects_oversize(client):
    r = client.post("/api/transcribe?lang=hi", content=b"0" * 3_000_000, headers={"content-type": "audio/webm"})
    assert r.status_code == 413


def test_transcribe_filters_hallucination(client, monkeypatch):
    async def fake_tx(audio, mime, language, prompt):
        return {"text": "Thank you for watching", "segments": [
            {"text": "Thank you for watching", "no_speech_prob": 0.1, "avg_logprob": -0.3}],
            "duration": 3.0}, groq_client.CallInfo(model="mock", latency_ms=3)

    monkeypatch.setattr(groq_client, "transcribe", fake_tx)
    r = client.post("/api/transcribe?lang=hi", content=b"1" * 5000, headers={"content-type": "audio/webm"})
    assert r.status_code == 200 and r.json()["text"] == ""


def test_schema_is_strict_compatible():
    def walk(node):
        if isinstance(node, dict) and node.get("type") == "object":
            assert node.get("additionalProperties") is False
            assert set(node["required"]) == set(node["properties"])
            for v in node["properties"].values():
                walk(v)
        if isinstance(node, dict) and node.get("type") == "array":
            walk(node["items"])
    walk(parser.PARSE_SCHEMA)


def test_security_headers(client):
    r = client.get("/api/health")
    assert "default-src 'self'" in r.headers["content-security-policy"]
