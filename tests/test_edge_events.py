import pytest
import time
from fastapi.testclient import TestClient
from backend.app.main import app, pipeline_instance, pg_reader

def test_ingest_edge_events_and_heartbeats():
    # Configure pipeline to postgres or dual mode
    pipeline_instance.mode = "postgres"
    if not pipeline_instance._pool:
        pipeline_instance._init_pool()
        pipeline_instance._start_worker()

    client = TestClient(app)
    dev_id = "test-edge-node-99"
    seq_num = 99001

    payload = [
        {
            "device_id": dev_id,
            "seq": seq_num,
            "kind": "event_thermal_throttle",
            "data": {
                "message": "CPU temperature exceeded 85C threshold",
                "data": {"temp_c": 86.5, "throttle_level": 2}
            }
        },
        {
            "device_id": dev_id,
            "seq": seq_num + 1,
            "kind": "heartbeat",
            "data": {
                "cpu_temp": 82.0,
                "ram_used_mb": 256.4,
                "link_state": "online",
                "queue_depth": 3,
                "power_mode": "normal",
                "clock_synced": True
            }
        }
    ]

    # Post batch to /ingest
    res = client.post("/ingest", json=payload)
    assert res.status_code == 200
    assert res.json()["received"] == 2

    # Test idempotency: send exact duplicate edge event
    res_dup = client.post("/ingest", json=[payload[0]])
    assert res_dup.status_code == 200

    # Wait for background queue batch to flush to postgres
    time.sleep(1.5)

    # Query PG directly to assert log is stored with source 'edge:test-edge-node-99'
    if pg_reader.is_healthy():
        logs = pg_reader.query_logs(source=f"edge:{dev_id}", limit=10)
        # Should contain the event
        matching = [l for l in logs if l.get("seq") == seq_num]
        assert len(matching) == 1, "Duplicate edge event must not create duplicate log row in Postgres"
        assert matching[0]["kind"] == "thermal_throttle"
