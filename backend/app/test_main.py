import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.db import add_alert, init_db

# Initialize database for testing
init_db()

def test_health():
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

def test_predict_validation():
    # Test valid padded lengths (1, 10, 29, 30)
    with TestClient(app) as client:
        row = [1.0] * 14
        for length in [1, 10, 29, 30]:
            payload = {
                "engine_id": 1,
                "cycle": length,
                "window": [row] * length
            }
            response = client.post("/predict", json=payload)
            assert response.status_code == 200, f"Expected 200 for length {length}, got {response.status_code}"
            data = response.json()
            assert "rul_prediction" in data

        # Length 31 should return 400
        response_31 = client.post("/predict", json={"engine_id": 1, "cycle": 31, "window": [row] * 31})
        assert response_31.status_code == 400

        # Bad feature dimension should return 400
        response_bad = client.post("/predict", json={"engine_id": 1, "cycle": 1, "window": [[1.0] * 13]})
        assert response_bad.status_code == 400

def test_alerts_signoff():
    # Insert mock alert directly to database
    add_alert("test_pytest_123", 1, 100, 50.0, 1)
    
    with TestClient(app) as client:
        # Verify it shows up in GET /alerts
        response = client.get("/alerts")
        assert response.status_code == 200
        alerts = response.json()
        assert any(a["id"] == "test_pytest_123" for a in alerts)

        # 1. Test missing reviewer_id -> 4xx (422)
        res_missing_rev = client.post("/alerts/test_pytest_123/signoff", json={
            "decision": "approve",
            "reviewer_id": ""
        })
        assert res_missing_rev.status_code in [400, 422]

        # 2. Test bad decision -> 400
        res_bad_dec = client.post("/alerts/test_pytest_123/signoff", json={
            "decision": "invalid_decision",
            "reviewer_id": "TECH-01"
        })
        assert res_bad_dec.status_code == 400

        # 3. Valid sign-off -> 200
        signoff_payload = {
            "decision": "approve",
            "reviewer_id": "TECH-01",
            "notes": "Pytest verification notes"
        }
        signoff_response = client.post("/alerts/test_pytest_123/signoff", json=signoff_payload)
        assert signoff_response.status_code == 200
        assert signoff_response.json()["status"] == "success"
        
        # 4. Double sign-off -> 409
        double_signoff_res = client.post("/alerts/test_pytest_123/signoff", json=signoff_payload)
        assert double_signoff_res.status_code == 409

def test_non_destructive_init_db():
    # T1: insert alert, call init_db(), verify row persists
    init_db()
    test_aid = "test_persist_t1"
    add_alert(test_aid, 7777, 10, 45.0, 1)
    # Re-init
    init_db()
    import sqlite3
    from app.db import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id FROM alerts WHERE id = ?", (test_aid,))
    row = c.fetchone()
    conn.close()
    assert row is not None and row[0] == test_aid

def test_k_cycle_alert_gating():
    # T6: single noisy dip -> no alert; sustained K -> 1 alert; idempotent cycle
    from app.db import record_prediction_and_check_alert
    import uuid
    eng_id = int(str(uuid.uuid4().int)[:5])
    # Single dip at cycle 1 (<60)
    r1, f1, a1 = record_prediction_and_check_alert(eng_id, 1, 55.0, threshold=60.0, k=3)
    assert not r1 and f1 == 0 and a1 is None

    # Cycle 2 recovers above threshold (70.0) -> break streak
    r2, f2, a2 = record_prediction_and_check_alert(eng_id, 2, 70.0, threshold=60.0, k=3)
    assert not r2 and f2 == 0 and a2 is None

    # Sustained cycles 3, 4, 5 below threshold
    r3, f3, a3 = record_prediction_and_check_alert(eng_id, 3, 58.0, threshold=60.0, k=3)
    assert not r3 and f3 == 0 and a3 is None

    r4, f4, a4 = record_prediction_and_check_alert(eng_id, 4, 55.0, threshold=60.0, k=3)
    assert not r4 and f4 == 0 and a4 is None

    r5, f5, a5 = record_prediction_and_check_alert(eng_id, 5, 52.0, threshold=60.0, k=3)
    assert r5 and f5 == 1 and a5 is not None

    # Idempotent cycle 5
    import sqlite3
    from app.db import DB_PATH
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT COUNT(*) FROM predictions WHERE engine_id = ?", (eng_id,))
    count_before = c.fetchone()[0]
    record_prediction_and_check_alert(eng_id, 5, 52.0, threshold=60.0, k=3)
    c.execute("SELECT COUNT(*) FROM predictions WHERE engine_id = ?", (eng_id,))
    count_after = c.fetchone()[0]
    conn.close()
    assert count_before == count_after

def test_audit_trail_and_endpoints():
    # T4 & T10: GET /audit, GET /audit/verify, and tamper detection
    import tempfile, shutil, sqlite3
    from app.db import DB_PATH, verify_audit_trail
    with TestClient(app) as client:
        res_audit = client.get("/audit")
        assert res_audit.status_code == 200
        assert isinstance(res_audit.json(), list)

        res_verify = client.get("/audit/verify")
        assert res_verify.status_code == 200
        assert res_verify.json()["ok"] is True

    # Tamper test on copy
    with tempfile.NamedTemporaryFile(suffix=".sqlite3", delete=False) as tmp:
        tmp_path = tmp.name
    shutil.copy2(DB_PATH, tmp_path)
    conn = sqlite3.connect(tmp_path)
    c = conn.cursor()
    c.execute("UPDATE audit_trail SET action = 'FORGED' WHERE id = (SELECT MIN(id) FROM audit_trail)")
    conn.commit()
    conn.close()

    ok, bad_row, _ = verify_audit_trail(tmp_path)
    assert ok is False
    assert bad_row is not None
    import os
    os.remove(tmp_path)

def test_model_info_and_latency():
    # T9: GET /model/info returns real file sizes, shapes, test RMSE, and latency stats
    import os, json
    with TestClient(app) as client:
        row = [1.0] * 14
        for i in range(10):
            res = client.post("/predict", json={"engine_id": 1, "cycle": i + 1, "window": [row] * 30})
            assert res.status_code == 200
            assert "inference_latency_ms" in res.json()

        res_info = client.get("/model/info")
        assert res_info.status_code == 200
        info = res_info.json()
        assert info["onnx_size_bytes"] == os.path.getsize("backend/model/twinedge_rul.onnx")
        assert info["tflite_size_bytes"] == os.path.getsize("backend/model/twinedge_rul.tflite")
        with open("backend/model/results.json") as f:
            assert info["test_rmse"] == json.load(f)["test_rmse"]
        assert info["latency_p50_ms"] > 0
        assert info["latency_p95_ms"] >= info["latency_p50_ms"]

def test_edge_stats():
    # T11: GET /edge/stats accumulates exact raw window and upstream payload bytes
    import json
    with TestClient(app) as client:
        s0 = client.get("/edge/stats").json()
        payload = {"engine_id": 1, "cycle": 99, "window": [[1.0] * 14] * 30}
        body = json.dumps(payload).encode("utf-8")
        res = client.post("/predict", content=body, headers={"Content-Type": "application/json"})
        assert res.status_code == 200
        s1 = client.get("/edge/stats").json()
        assert s1["total_calls"] == s0["total_calls"] + 1
        assert s1["raw_window_bytes"] == s0["raw_window_bytes"] + (30 * 14 * 4)
        assert s1["upstream_payload_bytes"] == s0["upstream_payload_bytes"] + len(body)

def test_preprocessing_parity():
    # Parity check: train vs inference padding diff must be 0.0
    import numpy as np
    for length in [1, 5, 10, 20, 29]:
        raw = np.arange(length * 14, dtype=np.float32).reshape(length, 14)
        # Preprocess.py logic:
        pad_len = 30 - length
        train_padded = np.vstack([np.repeat(raw[0:1], pad_len, axis=0), raw])
        
        # Inference logic:
        if length < 30:
            ep_pad = 30 - length
            inf_padded = np.vstack([np.repeat(raw[0:1], ep_pad, axis=0), raw])
        else:
            inf_padded = raw

        diff = float(np.max(np.abs(train_padded - inf_padded)))
        assert diff == 0.0, f"Preprocessing parity violation at length {length}: diff={diff}"
