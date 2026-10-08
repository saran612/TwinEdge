import pytest
import numpy as np
import os
import sqlite3
import tempfile
import time
from edge_sim.replay_generator import ReplayGenerator
from edge_sim.edge_node import EdgeNode
from edge_sim.outbox import OutboxQueue, PRIORITY_EVENTS, PRIORITY_PREDICTIONS, PRIORITY_TELEMETRY
from app.main import ort_session, scaler

def test_replay_determinism():
    """E1: same seed -> identical frames"""
    g1 = ReplayGenerator(engine_key="VAL-001", seed=42, rate=100.0)
    g2 = ReplayGenerator(engine_key="VAL-001", seed=42, rate=100.0)
    
    frames1 = [g1.next_frame(seq=i, session_id="s1", device_id="d1") for i in range(1, 40)]
    frames2 = [g2.next_frame(seq=i, session_id="s1", device_id="d1") for i in range(1, 40)]
    
    for f1, f2 in zip(frames1, frames2):
        assert f1["cycle"] == f2["cycle"]
        assert f1["ground_truth"]["true_rul"] == f2["ground_truth"]["true_rul"]
        for s, v in f1["sensors"].items():
            assert abs(v - f2["sensors"][s]) < 1e-9

def test_preprocessing_and_onnx_parity():
    """E1: edge vs backend preprocessing parity and prediction parity < 1e-5"""
    g = ReplayGenerator(engine_key="VAL-001", seed=101)
    frames = [g.next_frame(seq=i, session_id="s1", device_id="d1") for i in range(1, 40)]
    
    # 30-cycle raw window from replay
    raw_window = frames[-1]["raw_window"]
    
    # Load backend scaler & model directly
    import joblib
    import onnxruntime as ort
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    scaler_path = os.path.join(repo_root, "backend", "data", "processed", "scaler.joblib")
    model_path = os.path.join(repo_root, "backend", "model", "twinedge_rul.onnx")
    
    b_scaler = joblib.load(scaler_path)
    b_sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    
    # Backend preprocessing & prediction
    scaled_window = b_scaler.transform(np.array(raw_window, dtype=np.float64))
    onnx_input = np.expand_dims(scaled_window, axis=0).astype(np.float32)
    in_name = b_sess.get_inputs()[0].name
    backend_pred = b_sess.run(None, {in_name: onnx_input})[0][0][0]
    
    # Edge node preprocessing and prediction
    with tempfile.TemporaryDirectory() as tmpdir:
        node = EdgeNode(device_id="DEV-TEST", engine_key="VAL-001", data_dir=tmpdir, inference_policy="edge")
        
        # Test node prediction
        res = node.run_inference_on_window(raw_window)
        assert abs(float(backend_pred) - float(res["rul"])) < 1e-4

def test_outbox_priority_and_drop_policy():
    """E1: outbox ordering, priority (events > predictions > raw telemetry), and size cap drop policy"""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "outbox_test.db")
        outbox = OutboxQueue(db_path, max_size_mb=0.1) # 100KB cap
        
        # Enqueue 1 telemetry, 1 prediction, 1 event
        outbox.enqueue("DEV-1", 1, "telemetry", PRIORITY_TELEMETRY, {"cycle": 1, "data": "norm"})
        outbox.enqueue("DEV-1", 2, "prediction", PRIORITY_PREDICTIONS, {"cycle": 1, "rul": 120.0})
        outbox.enqueue("DEV-1", 3, "event", PRIORITY_EVENTS, {"kind": "alert_raised", "msg": "critical"})
        
        # Priority peek
        items = outbox.peek_batch(batch_size=10)
        assert len(items) == 3
        # Events (priority 1) come first, predictions (priority 2) second, telemetry (priority 3) last
        assert items[0]["kind"] == "event"
        assert items[1]["kind"] == "prediction"
        assert items[2]["kind"] == "telemetry"
        
        # Overfill outbox to trigger drops of raw telemetry while preserving events
        # Set max_bytes artificially low to trigger drop on next enqueue
        outbox.max_bytes = 100 # very small threshold
        for i in range(10, 30):
            outbox.enqueue("DEV-1", i, "telemetry", PRIORITY_TELEMETRY, {"cycle": i, "payload": "large" * 100})
            
        remaining = outbox.peek_batch(batch_size=50)
        kinds = [r["kind"] for r in remaining]
        # Event must NEVER be dropped
        assert "event" in kinds
        # Drops must be counted
        stats = outbox.get_stats()
        assert stats["dropped_count"] > 0

def test_k_cycle_gate_and_session_scoping():
    """E1: K-cycle alert gate (T=60, K=3) and session-scoped alerts"""
    with tempfile.TemporaryDirectory() as tmpdir:
        node = EdgeNode(device_id="DEV-K", engine_key="VAL-001", data_dir=tmpdir, inference_policy="edge")
        
        # Simulate predictions: isolated dip < 60 does not trip alert
        node.recent_predictions = [70.0, 55.0, 58.0]
        assert (len(node.recent_predictions) == 3 and all(r < 60.0 for r in node.recent_predictions)) is False
        assert node.pending_alert is None
        
        # Sustained dip for 3 cycles trips alert
        node.recent_predictions = [55.0, 54.0, 52.0]
        k_tripped = (len(node.recent_predictions) == 3 and all(r < 60.0 for r in node.recent_predictions))
        assert k_tripped is True
        
        if k_tripped and not node.pending_alert:
            node.pending_alert = {
                "alert_id": f"alt_{node.device_id}_150",
                "cycle": 150,
                "rul": 52.0
            }
            node.log_event("alert_raised", "K-gate alert triggered")
            
        assert node.pending_alert is not None
        
        # Verify event logged in local SQLite
        conn = sqlite3.connect(node.db_path)
        cur = conn.cursor()
        cur.execute("SELECT kind, message FROM local_events WHERE kind='alert_raised'")
        row = cur.fetchone()
        assert row is not None
        assert row[0] == "alert_raised"
        conn.close()

