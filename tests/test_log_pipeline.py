import pytest
import os
import time
import json
import tempfile
from backend.logsink.redaction import redact_text, redact_object
from backend.logsink.rate_limiter import EventRateLimiter
from backend.logsink.pipeline import PostgresLogPipeline, MAX_QUEUE_SIZE

def test_redaction_text():
    raw = "User logged in with token=mySecretToken12345 and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    cleaned = redact_text(raw)
    assert "mySecretToken12345" not in cleaned
    assert "eyJhbGciOi" not in cleaned
    assert "[REDACTED]" in cleaned

def test_redaction_object():
    obj = {
        "device_id": "EDGE-01",
        "password": "superSecretPassword!",
        "authorization": "Bearer token1234567890",
        "nested": {
            "api_key": "key987654321",
            "normal_field": 42
        }
    }
    cleaned = redact_object(obj)
    assert cleaned["password"] == "[REDACTED]"
    assert cleaned["authorization"] == "[REDACTED]"
    assert cleaned["nested"]["api_key"] == "[REDACTED]"
    assert cleaned["nested"]["normal_field"] == 42

def test_rate_limiter():
    limiter = EventRateLimiter(max_per_sec=3, window_s=0.5)
    # First 3 should pass
    for _ in range(3):
        allow, suppressed = limiter.check("edge:dev1", "status_ping")
        assert allow is True
    # 4th should be throttled
    allow, suppressed = limiter.check("edge:dev1", "status_ping")
    assert allow is False

    # After window passes, should allow again and report suppressed count
    time.sleep(0.6)
    allow, suppressed = limiter.check("edge:dev1", "status_ping")
    assert allow is True
    assert suppressed >= 1

def test_priority_drop_policy():
    with tempfile.NamedTemporaryFile(suffix=".jsonl") as tf:
        pipe = PostgresLogPipeline(mode="postgres", spool_path=tf.name)
        # Stop worker thread so it does not drain the queue while we test
        pipe.stop()

        # Fill queue to maximum with fake items
        for i in range(MAX_QUEUE_SIZE):
            pipe._queue.put({"level": 20, "message": f"info {i}"})
        
        # Enqueueing INFO when queue is full should drop INFO
        dropped = pipe.emit(level=20, source="backend", event="test", message="drop me")
        assert dropped is False
        assert pipe._dropped_info >= 1

        # Enqueueing ERROR when queue is full should NEVER drop ERROR
        # It evicts an older record and inserts ERROR
        added_error = pipe.emit(level=40, source="backend", event="crit", message="urgent error")
        assert added_error is True


def test_spool_and_replay_order():
    with tempfile.NamedTemporaryFile(suffix=".jsonl", delete=False) as tf:
        spool_file = tf.name

    pipe = PostgresLogPipeline(mode="postgres", spool_path=spool_file)
    batch = [
        {"ts": "2026-10-09T00:00:00Z", "level": 20, "source": "backend", "event": "ev1", "message": "msg 1", "data": {}},
        {"ts": "2026-10-09T00:00:01Z", "level": 20, "source": "backend", "event": "ev2", "message": "msg 2", "data": {}}
    ]
    pipe._spool_batch(batch)

    # Check file contents
    with open(spool_file, "r") as f:
        lines = [json.loads(line) for line in f]
    assert len(lines) == 2
    assert lines[0]["event"] == "ev1"
    assert lines[1]["event"] == "ev2"

    pipe.stop()
    if os.path.exists(spool_file):
        os.remove(spool_file)
