import os
import sys
import json
import time
import collections
import joblib
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Body, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
from influxdb_client import InfluxDBClient

from app.db import (
    get_unresolved_alerts, 
    get_all_alerts, 
    signoff_alert, 
    add_alert, 
    record_prediction_and_check_alert,
    get_audit_trail, 
    verify_audit_trail, 
    DB_PATH
)

app = FastAPI(title="TwinEdge Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Root and Config Paths wiring
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

try:
    from config import paths
    MODEL_PATH = str(paths.ONNX_MODEL_PATH)
    TFLITE_PATH = str(paths.TFLITE_MODEL_PATH)
    SCALER_PATH = str(paths.SCALER_PATH)
    RESULTS_PATH = str(paths.RESULTS_PATH)
    FEATURES_PATH = str(paths.FEATURES_PATH)
    REGISTRY_PATH = str(paths.REGISTRY_PATH)
    GOLDEN_FIXTURES_PATH = str(paths.GOLDEN_FIXTURES_PATH)
except Exception:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    MODEL_PATH = os.path.join(BASE_DIR, "model", "twinedge_rul.onnx")
    TFLITE_PATH = os.path.join(BASE_DIR, "model", "twinedge_rul.tflite")
    SCALER_PATH = os.path.join(BASE_DIR, "data", "processed", "scaler.joblib")
    RESULTS_PATH = os.path.join(BASE_DIR, "model", "results.json")
    FEATURES_PATH = os.path.join(BASE_DIR, "data", "processed", "active_features.txt")
    REGISTRY_PATH = os.path.join(ROOT_DIR, "models", "registry.json")
    GOLDEN_FIXTURES_PATH = os.path.join(ROOT_DIR, "models", "golden", "golden_fixtures.json")

# Global variables loaded at startup
ort_session = None
scaler = None
influx_client = None
metadata = {}
registry_data = {}

# Metrics & telemetry tracking state
latency_history = collections.deque(maxlen=500)
edge_stats_state = {
    "total_calls": 0,
    "raw_window_bytes": 0,          # 30 * 14 * 4 bytes per uncompressed window
    "upstream_payload_bytes": 0     # actual serialized body bytes sent/received
}

def _compute_sha256(filepath: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

@app.on_event("startup")
def startup_event():
    global ort_session, scaler, influx_client, metadata, registry_data
    
    # 1. Verify existence of required model and pipeline files
    for req_name, req_path in [("ONNX Model", MODEL_PATH), ("Scaler", SCALER_PATH), ("Features list", FEATURES_PATH)]:
        if not os.path.exists(req_path):
            raise RuntimeError(f"STARTUP SELF-CHECK FAILED: {req_name} does not exist at '{req_path}'")

    # 2. Verify SHA-256 against registry if registry exists
    if os.path.exists(REGISTRY_PATH):
        try:
            with open(REGISTRY_PATH, "r") as f:
                registry_data = json.load(f)
            onnx_expected_hash = registry_data.get("artifacts", {}).get("onnx", {}).get("sha256")
            if onnx_expected_hash:
                actual_onnx_hash = _compute_sha256(MODEL_PATH)
                if actual_onnx_hash != onnx_expected_hash:
                    raise RuntimeError(
                        f"STARTUP SELF-CHECK FAILED: ONNX model SHA256 mismatch! "
                        f"Expected {onnx_expected_hash}, got {actual_onnx_hash}"
                    )
            scaler_expected_hash = registry_data.get("artifacts", {}).get("scaler", {}).get("sha256")
            if scaler_expected_hash:
                actual_scaler_hash = _compute_sha256(SCALER_PATH)
                if actual_scaler_hash != scaler_expected_hash:
                    raise RuntimeError(
                        f"STARTUP SELF-CHECK FAILED: Scaler SHA256 mismatch! "
                        f"Expected {scaler_expected_hash}, got {actual_scaler_hash}"
                    )
        except Exception as e:
            if isinstance(e, RuntimeError):
                raise
            print(f"Warning reading registry: {e}")

    # 3. Load ONNX Model & Verify I/O Signature
    try:
        ort_session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        print(f"Loaded ONNX model successfully from {MODEL_PATH}")
    except Exception as e:
        raise RuntimeError(f"STARTUP SELF-CHECK FAILED: Could not initialize ONNX runtime session: {e}")

    # Check input signature [batch, 30, 14]
    input_info = ort_session.get_inputs()[0]
    input_shape = input_info.shape
    if len(input_shape) != 3 or input_shape[1] != 30 or input_shape[2] != 14:
        raise RuntimeError(
            f"STARTUP SELF-CHECK FAILED: Invalid ONNX input shape {input_shape}. "
            f"Expected [batch, 30, 14]."
        )
    # Check output signature [batch, 1]
    output_info = ort_session.get_outputs()[0]
    output_shape = output_info.shape
    if len(output_shape) != 2 or output_shape[1] != 1:
        raise RuntimeError(
            f"STARTUP SELF-CHECK FAILED: Invalid ONNX output shape {output_shape}. "
            f"Expected [batch, 1]."
        )

    # 4. Canary verification: golden window -> expected RUL within 1e-3
    canary_tested = False
    if registry_data and "canary" in registry_data:
        canary = registry_data["canary"]
        canary_window = np.array([canary["window"]], dtype=np.float32) # [1, 30, 14]
        expected_rul = float(canary["expected_rul"])
        tolerance = float(canary.get("tolerance", 1e-3))
        
        input_name = ort_session.get_inputs()[0].name
        raw_pred = ort_session.run(None, {input_name: canary_window})[0][0][0]
        abs_diff = abs(float(raw_pred) - expected_rul)
        if abs_diff > tolerance:
            raise RuntimeError(
                f"STARTUP SELF-CHECK FAILED: Canary validation failed! "
                f"Predicted RUL {raw_pred:.6f} vs Expected {expected_rul:.6f} (diff {abs_diff:.6e} > {tolerance})"
            )
        print(f"Startup canary check passed: pred={raw_pred:.4f}, expected={expected_rul:.4f}, diff={abs_diff:.2e}")
        canary_tested = True

    # 5. Load Scaler
    try:
        scaler = joblib.load(SCALER_PATH)
        print(f"Loaded StandardScaler successfully from {SCALER_PATH}")
    except Exception as e:
        raise RuntimeError(f"STARTUP SELF-CHECK FAILED: Failed to load scaler from {SCALER_PATH}: {e}")

    # Load metadata
    if os.path.exists(RESULTS_PATH):
        try:
            with open(RESULTS_PATH, "r") as f:
                metadata = json.load(f)
            print(f"Loaded metadata successfully from {RESULTS_PATH}")
        except Exception as e:
            print(f"Error loading metadata: {e}")
    else:
        print(f"Warning: Metadata not found at {RESULTS_PATH}")


    # Setup InfluxDB client connection
    influx_url = os.getenv("INFLUXDB_URL", "http://localhost:8086")
    influx_token = os.getenv("INFLUXDB_TOKEN")
    if not influx_token:
        # Check if running in test environment; if not, raise error
        if os.getenv("TESTING") == "1" or "pytest" in sys.modules:
            print("Warning: INFLUXDB_TOKEN not set in test environment, proceeding without InfluxDB connection")
        else:
            raise RuntimeError("CRITICAL CONFIGURATION ERROR: INFLUXDB_TOKEN environment variable is required but not set.")
    else:
        try:
            influx_client = InfluxDBClient(url=influx_url, token=influx_token, org=os.getenv("INFLUXDB_ORG", "twinedge"))
            print(f"Connected to InfluxDB at {influx_url}")
        except Exception as e:
            print(f"Failed to connect to InfluxDB: {e}")

last_simulator_mqtt_status = None

def check_mqtt_broker() -> bool:
    import socket
    try:
        sock = socket.create_connection(("localhost", 1883), timeout=0.3)
        sock.close()
        return True
    except Exception:
        return False

class WindowInput(BaseModel):
    engine_id: int
    cycle: int
    # 30 cycles of 14 active sensor values
    window: List[List[float]]
    mqtt_active: Optional[bool] = None

@app.get("/health")
def health():
    downstream_ok = False
    if influx_client:
        try:
            downstream_ok = influx_client.ping()
        except Exception:
            downstream_ok = False

    mqtt_broker_ok = check_mqtt_broker()
    pipeline_bypass = (not mqtt_broker_ok) or (last_simulator_mqtt_status is False)

    return {
        "status": "ok", 
        "message": "TwinEdge backend inference service running",
        "model_loaded": ort_session is not None,
        "scaler_loaded": scaler is not None,
        "downstream_connected": downstream_ok,
        "mqtt_broker_online": mqtt_broker_ok,
        "pipeline_bypass": pipeline_bypass,
        "pipeline_mode": "http_bypass" if pipeline_bypass else "mqtt_pipeline",
        "metadata": metadata
    }

@app.post("/predict")
async def predict(data: WindowInput, request: Request):
    global ort_session, scaler, last_simulator_mqtt_status, latency_history, edge_stats_state
    if ort_session is None or scaler is None:
        raise HTTPException(status_code=503, detail="Model or Scaler not loaded on server.")
        
    if data.mqtt_active is not None:
        last_simulator_mqtt_status = data.mqtt_active

    # Track upstream payload bytes (actual serialized request body)
    try:
        body_bytes = await request.body()
        payload_len = len(body_bytes)
    except Exception:
        payload_len = len(json.dumps(data.dict()).encode("utf-8"))

    # Raw window bytes: uncompressed float32 tensor of shape (30, 14) -> 30 * 14 * 4 = 1680 bytes
    raw_window_bytes = 30 * 14 * 4

    edge_stats_state["total_calls"] += 1
    edge_stats_state["raw_window_bytes"] += raw_window_bytes
    edge_stats_state["upstream_payload_bytes"] += payload_len

    try:
        window_arr = np.array(data.window, dtype=np.float32)
        # Check dimensionality
        if window_arr.ndim != 2:
            raise HTTPException(
                status_code=400,
                detail=f"Expected 2D window (N, 14), got shape {window_arr.shape}"
            )
        
        num_rows, num_features = window_arr.shape
        if num_features != 14:
            raise HTTPException(
                status_code=400,
                detail=f"Expected 14 sensor features per cycle, got {num_features}"
            )
            
        if num_rows == 0 or num_rows > 30:
            raise HTTPException(
                status_code=400,
                detail=f"Expected window length between 1 and 30, got {num_rows}"
            )
            
        # Early-cycle front-padding matching preprocess.py:
        if num_rows < 30:
            pad_len = 30 - num_rows
            window_arr = np.vstack([np.repeat(window_arr[0:1], pad_len, axis=0), window_arr])
            
        # 1. Standard scale the window features using the fitted scaler
        scaled_window = scaler.transform(window_arr)
        
        # 2. Reshape for ONNX input: (1, 30, 14)
        onnx_input = np.expand_dims(scaled_window, axis=0).astype(np.float32)
        
        # 3. Run ONNX inference timed with time.perf_counter()
        t0 = time.perf_counter()
        input_name = ort_session.get_inputs()[0].name
        ort_outputs = ort_session.run(None, {input_name: onnx_input})
        t1 = time.perf_counter()
        inference_latency_ms = (t1 - t0) * 1000.0

        # Record in rolling latency deque
        latency_history.append(inference_latency_ms)

        rul_pred = float(ort_outputs[0][0][0])
        
        # Clamp RUL between 0 and 125
        rul_pred = max(0.0, min(125.0, rul_pred))
        
        # 4. K-cycle alert gating using insert-only predictions table
        threshold = float(os.getenv("RUL_ALERT_THRESHOLD", 60.0))
        k_cycles = int(os.getenv("ALERT_SUSTAINED_CYCLES", 3))
        alert_raised, anomaly_flag, alert_id = record_prediction_and_check_alert(
            engine_id=data.engine_id,
            cycle=data.cycle,
            rul_pred=round(rul_pred, 1),
            threshold=threshold,
            k=k_cycles
        )

        # 7. Ingest telemetry into local SQLite buffer (idempotent upsert)
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            curr_sensors = data.window[-1] if len(data.window) > 0 else []
            t_payload = {
                "engine_id": data.engine_id,
                "cycle": data.cycle,
                "rul_prediction": round(rul_pred, 1),
                "anomaly_flag": anomaly_flag,
                "sensors": curr_sensors
            }
            cursor.execute("""
                INSERT OR REPLACE INTO telemetry_buffer (engine_id, cycle, timestamp, payload)
                VALUES (?, ?, ?, ?)
            """, (data.engine_id, data.cycle, datetime.utcnow().isoformat(), json.dumps(t_payload)))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"Error buffering telemetry in predict: {e}")

        return {
            "rul_prediction": round(rul_pred, 2),
            "anomaly_flag": anomaly_flag,
            "inference_latency_ms": round(inference_latency_ms, 3)
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


# H1. GET /telemetry/recent - last N telemetry points from InfluxDB (with SQLite fallback)
@app.get("/telemetry/recent")
def get_recent_telemetry(engine_id: Optional[int] = None, limit: int = 50):
    global influx_client
    records = []
    if influx_client is not None:
        try:
            query_api = influx_client.query_api()
            
            # Query sensor data from InfluxDB
            filter_engine = f'r.engine_id == "{engine_id}"' if engine_id else 'true'
            flux_query = f'''
            from(bucket: "telemetry")
              |> range(start: -1h)
              |> filter(fn: (r) => r["_measurement"] == "telemetry")
              |> filter(fn: (r) => {filter_engine})
              |> limit(n: {limit})
            '''
            
            tables = query_api.query(flux_query)
            for table in tables:
                for record in table.records:
                    engine_id_val = record.values.get("engine_id")
                    cycle_val = record.values.get("cycle")
                    records.append({
                        "time": record.get_time().isoformat() if record.get_time() else datetime.utcnow().isoformat(),
                        "engine_id": int(engine_id_val) if engine_id_val is not None else 0,
                        "cycle": int(cycle_val) if cycle_val is not None else 0,
                        "sensor": record.get_field(),
                        "value": record.get_value()
                    })

            if records:
                return records
        except Exception as e:
            # Fallback: log and check local SQLite buffer
            print(f"InfluxDB read error (falling back to SQLite buffer): {e}")

    # Fallback: Query local SQLite telemetry buffer
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        if engine_id:
            cursor.execute(
                "SELECT engine_id, cycle, timestamp, payload FROM telemetry_buffer WHERE engine_id = ? ORDER BY id DESC LIMIT ?",
                (engine_id, limit)
            )
        else:
            cursor.execute(
                "SELECT engine_id, cycle, timestamp, payload FROM telemetry_buffer ORDER BY id DESC LIMIT ?",
                (limit,)
            )
        rows = cursor.fetchall()
        conn.close()

        for r_engine_id, r_cycle, r_time, r_payload_str in rows:
            try:
                p = json.loads(r_payload_str)
                if "sensors" in p and isinstance(p["sensors"], list):
                    for s_idx, s_val in enumerate(p["sensors"]):
                        records.append({
                            "time": r_time,
                            "engine_id": r_engine_id,
                            "cycle": r_cycle,
                            "sensor": f"sensor_{s_idx+1}",
                            "value": float(s_val)
                        })
                if "rul_prediction" in p:
                    records.append({
                        "time": r_time,
                        "engine_id": r_engine_id,
                        "cycle": r_cycle,
                        "sensor": "rul_prediction",
                        "value": float(p["rul_prediction"])
                    })
            except Exception:
                continue

        return records
    except Exception as e:
        print(f"SQLite telemetry buffer read error: {e}")
        return []

# H2. GET /alerts - current alerts in the sign-off queue
@app.get("/alerts")
def get_alerts(unresolved_only: bool = True):
    if unresolved_only:
        return get_unresolved_alerts()
    return get_all_alerts()

# H3. POST /alerts/{id}/signoff - AME decision recording
# NOTE (Prototype Identity): This records reviewer identity for prototyping and audit accountability,
# not full cryptographic license certificate verification.
class SignoffRequest(BaseModel):
    decision: Optional[str] = None # approve | reject
    status: Optional[str] = None # backward compatibility for APPROVED | REJECTED
    reviewer_id: str
    notes: Optional[str] = ""

@app.post("/alerts/{alert_id}/signoff")
def post_signoff(alert_id: str, request: SignoffRequest):
    """
    Records an engineer sign-off decision on an active alert.
    Requires decision ('approve' or 'reject') and a non-empty reviewer_id.
    Note: Prototype identity only; does not perform cryptographic license signature check.
    """
    if not request.reviewer_id or not request.reviewer_id.strip():
        raise HTTPException(status_code=422, detail="reviewer_id is required and cannot be empty")
        
    decision = request.decision or (request.status.lower() if request.status else "")
    if decision not in ["approve", "reject", "approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid decision. Must be 'approve' or 'reject'.")

    normalized_status = "APPROVED" if decision in ["approve", "approved"] else "REJECTED"

    # Check alert state to prevent double signoff
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT status FROM alerts WHERE id = ?", (alert_id,))
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
    if row["status"] in ["APPROVED", "REJECTED"]:
        raise HTTPException(status_code=409, detail=f"Alert {alert_id} has already been signed off with status {row['status']}")

    try:
        signoff_alert(alert_id, normalized_status, request.reviewer_id.strip(), request.notes)
        return {
            "status": "success", 
            "decision": normalized_status.lower(),
            "reviewer_id": request.reviewer_id.strip(),
            "message": f"Alert {alert_id} signed off as {normalized_status}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# H4. GET /audit - full immutable audit trail chain
@app.get("/audit")
def get_audit():
    return get_audit_trail()

# H5. GET /audit/verify - cryptographic verification of hash chain
@app.get("/audit/verify")
def get_audit_verify():
    ok, bad_row, message = verify_audit_trail()
    return {
        "ok": ok,
        "first_bad_row": bad_row,
        "message": message
    }

# H6. GET /model/info - live model metadata, registry data, file sizes, shapes, test RMSE, and latency stats
@app.get("/model/info")
def get_model_info():
    global ort_session, latency_history, metadata, registry_data
    
    # ONNX & TFLite file sizes read directly from disk
    onnx_size_bytes = os.path.getsize(MODEL_PATH) if os.path.exists(MODEL_PATH) else 0
    tflite_size_bytes = os.path.getsize(TFLITE_PATH) if os.path.exists(TFLITE_PATH) else 0
    
    # Input/Output shapes
    if ort_session is not None:
        input_shape = [dim if isinstance(dim, int) else -1 for dim in ort_session.get_inputs()[0].shape]
        output_shape = [dim if isinstance(dim, int) else -1 for dim in ort_session.get_outputs()[0].shape]
    else:
        input_shape = [1, 30, 14]
        output_shape = [1, 1]

    # Feature list
    features = []
    if os.path.exists(FEATURES_PATH):
        with open(FEATURES_PATH, "r") as f:
            features = [line.strip() for line in f if line.strip()]

    # Test RMSE read directly from results.json
    test_rmse = None
    if os.path.exists(RESULTS_PATH):
        try:
            with open(RESULTS_PATH, "r") as f:
                res_data = json.load(f)
                test_rmse = res_data.get("test_rmse")
        except Exception:
            pass

    # Latency percentiles over last 500 calls
    latencies = list(latency_history)
    if latencies:
        p50 = float(np.percentile(latencies, 50))
        p95 = float(np.percentile(latencies, 95))
    else:
        p50 = 0.0
        p95 = 0.0

    return {
        "model_name": "twinedge_rul_cnn",
        "onnx_size_bytes": onnx_size_bytes,
        "tflite_size_bytes": tflite_size_bytes,
        "input_shape": input_shape,
        "output_shape": output_shape,
        "window_n": 30,
        "features": features,
        "feature_count": len(features),
        "test_rmse": test_rmse,
        "latency_p50_ms": round(p50, 3),
        "latency_p95_ms": round(p95, 3),
        "sample_count": len(latencies),
        "registry": registry_data
    }

# H7. GET /edge/stats - measured edge vs upstream bytes and empirical ratio
@app.get("/edge/stats")
def get_edge_stats():
    global edge_stats_state
    raw = edge_stats_state["raw_window_bytes"]
    upstream = edge_stats_state["upstream_payload_bytes"]
    calls = edge_stats_state["total_calls"]
    # Ratio of upstream bytes to raw float32 tensor bytes
    ratio = (upstream / raw) if raw > 0 else 0.0
    
    return {
        "total_calls": calls,
        "raw_window_bytes": raw,
        "upstream_payload_bytes": upstream,
        "payload_to_raw_ratio": round(ratio, 4)
    }
