"""
Edge Node Engine: async execution loop running local preprocessing, ONNX Runtime inference,
K-gate alerting, SQLite WAL storage, and outbox uplink flushing.
"""
import os
import sys
import time
import json
import sqlite3
import hashlib
import asyncio
import numpy as np
import onnxruntime as ort
import joblib
from typing import Dict, Any, Optional

from edge_sim.replay_generator import ReplayGenerator
from edge_sim.outbox import OutboxQueue, PRIORITY_EVENTS, PRIORITY_PREDICTIONS, PRIORITY_TELEMETRY
from edge_sim.uplink import UplinkTransport

RUL_CAP = 125.0
K_GATE_THRESHOLD = 60.0
K_GATE_COUNT = 3

class EdgeNode:
    def __init__(
        self,
        device_id: str,
        engine_key: str = "VAL-001",
        inference_policy: str = "auto", # edge | cloud | auto
        rate: float = 1.0, # cycles / s
        seed: int = 42,
        scenario: str = "lifecycle",
        cloud_url: str = "http://localhost:8000",
        data_dir: Optional[str] = None,
        outbox_cap_mb: float = 10.0
    ):
        self.device_id = device_id
        self.engine_key = engine_key
        self.inference_policy = inference_policy
        self.rate = rate
        self.seed = seed
        self.scenario = scenario
        self.cloud_url = cloud_url
        self.session_id = f"sess_{device_id}_{int(time.time())}"
        
        # Base directories
        repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_dir = data_dir or os.path.join(repo_root, "data", "edge", device_id)
        os.makedirs(self.data_dir, exist_ok=True)
        self.db_path = os.path.join(self.data_dir, "edge.db")
        self.log_file = os.path.join(self.data_dir, "node.jsonl")

        # Models & preprocessor
        self.model_path = os.path.join(repo_root, "backend", "model", "twinedge_rul.onnx")
        self.scaler_path = os.path.join(repo_root, "backend", "data", "processed", "scaler.joblib")
        
        self.ort_session = None
        self.scaler = None
        self.model_sha = ""
        self._load_models()

        # Replay, Outbox, Uplink
        self.replay = ReplayGenerator(
            engine_key=engine_key,
            seed=seed,
            rate=rate,
            scenario=scenario
        )
        self.outbox = OutboxQueue(self.db_path, max_size_mb=outbox_cap_mb)
        self.uplink = UplinkTransport(cloud_url=cloud_url, device_key=f"key_{device_id}")

        self.seq = 0
        self.running = False
        self.current_cycle = 30
        self.recent_predictions = []
        self.pending_alert = None
        self.last_state = {}
        self.active_inference_site = "EDGE" if inference_policy == "edge" else "CLOUD"

        self._init_sqlite()

    def _load_models(self):
        if os.path.exists(self.model_path):
            self.ort_session = ort.InferenceSession(self.model_path, providers=["CPUExecutionProvider"])
            with open(self.model_path, "rb") as f:
                self.model_sha = hashlib.sha256(f.read()).hexdigest()
        if os.path.exists(self.scaler_path):
            self.scaler = joblib.load(self.scaler_path)

    def _init_sqlite(self):
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL;")
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS local_telemetry (
                seq INTEGER PRIMARY KEY,
                cycle INTEGER,
                data TEXT,
                ts REAL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS local_predictions (
                cycle INTEGER PRIMARY KEY,
                rul REAL,
                site TEXT,
                latency_ms REAL,
                ts REAL
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS local_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                kind TEXT,
                message TEXT,
                data TEXT,
                ts REAL
            )
        """)
        conn.commit()
        conn.close()

    def log_event(self, kind: str, message: str, data: Optional[Dict[str, Any]] = None):
        ts = time.time()
        record = {
            "ts": ts,
            "device_id": self.device_id,
            "engine_key": self.engine_key,
            "session_id": self.session_id,
            "kind": kind,
            "message": message,
            "data": data or {}
        }
        # Append JSONL log
        with open(self.log_file, "a") as f:
            f.write(json.dumps(record) + "\n")

        # Insert to local SQLite
        conn = sqlite3.connect(self.db_path)
        c = conn.cursor()
        c.execute("INSERT INTO local_events (kind, message, data, ts) VALUES (?, ?, ?, ?)",
                  (kind, message, json.dumps(data or {}), ts))
        conn.commit()
        conn.close()

        # Enqueue to Outbox with highest priority
        self.outbox.enqueue(self.device_id, self.seq, f"event_{kind}", PRIORITY_EVENTS, record)

    def run_inference_on_window(self, window: list) -> Dict[str, Any]:
        t0 = time.perf_counter()
        arr = np.array(window, dtype=np.float64)
        scaled = self.scaler.transform(arr)
        onnx_in = np.expand_dims(scaled, axis=0).astype(np.float32)
        in_name = self.ort_session.get_inputs()[0].name
        out = self.ort_session.run(None, {in_name: onnx_in})[0][0][0]
        latency = (time.perf_counter() - t0) * 1000.0

        rul = float(np.clip(out, 0.0, RUL_CAP))
        return {
            "rul": rul,
            "latency_ms": round(latency, 2),
            "site": "EDGE",
            "model_sha": self.model_sha
        }

    def process_cycle(self) -> Dict[str, Any]:
        self.seq += 1
        frame = self.replay.next_frame(self.seq, self.session_id, self.device_id)
        if not frame:
            return {}

        self.current_cycle = frame["cycle"]
        is_warmup = (self.current_cycle < 30)

        # Decide inference site
        if self.inference_policy == "edge":
            site = "EDGE"
        elif self.inference_policy == "cloud":
            site = "CLOUD"
        else: # auto failover
            site = "CLOUD" if self.uplink.is_link_up else "EDGE"

        if site != self.active_inference_site:
            self.log_event("site_switch", f"Switched inference site from {self.active_inference_site} to {site}")
            self.active_inference_site = site

        inf_result = {}
        if site == "EDGE" and self.ort_session and self.scaler:
            inf_result = self.run_inference_on_window(frame["raw_window"])
            rul = inf_result["rul"]
            health_idx = round((rul / RUL_CAP) * 100)
            band = "WARMUP" if is_warmup else ("HEALTHY" if rul >= 80 else ("DEGRADING" if rul >= 40 else "CRITICAL"))

            # K-cycle alert gate
            self.recent_predictions.append(rul)
            if len(self.recent_predictions) > K_GATE_COUNT:
                self.recent_predictions.pop(0)

            k_tripped = (len(self.recent_predictions) == K_GATE_COUNT and all(r < K_GATE_THRESHOLD for r in self.recent_predictions))
            if k_tripped and not self.pending_alert:
                self.pending_alert = {
                    "alert_id": f"alt_{self.device_id}_{self.current_cycle}",
                    "cycle": self.current_cycle,
                    "rul": rul
                }
                self.log_event("alert_raised", f"K-gate sustained alert triggered at cycle {self.current_cycle} (RUL={rul:.1f})")

            frame["inference"] = inf_result
            frame["twin"] = {
                "health_index": health_idx,
                "band": band
            }
            frame["alert"] = {
                "state": "ACTIVE" if self.pending_alert else "NONE",
                "k_count": sum(1 for r in self.recent_predictions if r < K_GATE_THRESHOLD)
            }

            # Enqueue prediction
            self.outbox.enqueue(self.device_id, self.seq, "prediction", PRIORITY_PREDICTIONS, {
                "device_id": self.device_id,
                "session_id": self.session_id,
                "engine_key": self.engine_key,
                "cycle": self.current_cycle,
                "inference": inf_result,
                "twin": frame["twin"]
            })

        # Enqueue raw telemetry
        self.outbox.enqueue(self.device_id, self.seq, "telemetry", PRIORITY_TELEMETRY, {
            "device_id": self.device_id,
            "session_id": self.session_id,
            "engine_key": self.engine_key,
            "cycle": self.current_cycle,
            "sensors": frame["sensors"],
            "ground_truth": frame["ground_truth"]
        })

        if frame.get("is_eol"):
            self.log_event("eol", f"Engine {self.engine_key} reached end-of-life at cycle {self.current_cycle}")

        self.last_state = frame
        return frame

    def flush_outbox(self):
        batch = self.outbox.peek_batch(batch_size=25)
        if not batch:
            return
        ok = self.uplink.send_batch(batch)
        if ok:
            ids = [it["id"] for it in batch]
            self.outbox.ack_batch(ids)
        else:
            ids = [it["id"] for it in batch]
            self.outbox.record_attempt(ids)
