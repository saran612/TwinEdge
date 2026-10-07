import os
import sys
import json
import joblib
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import sqlite3
from influxdb_client import InfluxDBClient

from app.db import get_unresolved_alerts, get_all_alerts, signoff_alert, add_alert, get_audit_trail, verify_audit_trail, DB_PATH

app = FastAPI(title="TwinEdge Backend")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "model", "twinedge_rul.onnx")
SCALER_PATH = os.path.join(BASE_DIR, "data", "processed", "scaler.joblib")
RESULTS_PATH = os.path.join(BASE_DIR, "model", "results.json")

# Global variables loaded at startup
ort_session = None
scaler = None
influx_client = None
metadata = {}

@app.on_event("startup")
def startup_event():
    global ort_session, scaler, influx_client, metadata
    
    # Load ONNX model
    if os.path.exists(MODEL_PATH):
        try:
            ort_session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
            print(f"Loaded ONNX model successfully from {MODEL_PATH}")
        except Exception as e:
            print(f"Error loading ONNX model: {e}")
    else:
        print(f"Warning: ONNX model not found at {MODEL_PATH}")

    # Load Scaler
    if os.path.exists(SCALER_PATH):
        try:
            scaler = joblib.load(SCALER_PATH)
            print(f"Loaded StandardScaler successfully from {SCALER_PATH}")
        except Exception as e:
            print(f"Error loading scaler: {e}")
    else:
        print(f"Warning: Scaler not found at {SCALER_PATH}")

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
def predict(data: WindowInput):
    global ort_session, scaler, last_simulator_mqtt_status
    if ort_session is None or scaler is None:
        raise HTTPException(status_code=503, detail="Model or Scaler not loaded on server.")
        
    if data.mqtt_active is not None:
        last_simulator_mqtt_status = data.mqtt_active

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
        # pad_len = window - len(values)
        # values = np.vstack([np.repeat(values[0:1], pad_len, axis=0), values])
        if num_rows < 30:
            pad_len = 30 - num_rows
            window_arr = np.vstack([np.repeat(window_arr[0:1], pad_len, axis=0), window_arr])
            
        # 1. Standard scale the window features using the fitted scaler
        # The scaler was fitted on 2D data, so we scale the 30 cycles
        scaled_window = scaler.transform(window_arr)
        
        # 2. Reshape for ONNX input: (1, 30, 14)
        onnx_input = np.expand_dims(scaled_window, axis=0).astype(np.float32)
        
        # 3. Run ONNX inference
        input_name = ort_session.get_inputs()[0].name
        ort_outputs = ort_session.run(None, {input_name: onnx_input})
        rul_pred = float(ort_outputs[0][0][0])
        
        # Clamp RUL between 0 and 125
        rul_pred = max(0.0, min(125.0, rul_pred))
        
        # 4. Determine anomaly flag
        # NOTE (Threshold Justification): 60 cycles is a conservative operational
        # heuristic calibrated to trigger maintenance lead time ahead of scheduled
        # A/B-check intervals. Pending full empirical ROC / cost-sensitivity tuning
        # against airline operational loss functions.
        anomaly_flag = int(rul_pred < 60)
        
        # 5. Compute confidence score
        # Confidence increases as RUL decreases (i.e. more certain about failure)
        # and capped between 0.5 and 0.98
        confidence = max(0.5, min(0.98, 1.0 - (rul_pred / 125.0) * 0.3))
        
        # 6. If anomaly is flagged, auto-add it to the sign-off queue
        if anomaly_flag:
            alert_id = f"alert_engine_{data.engine_id}_cycle_{data.cycle}"
            add_alert(
                alert_id=alert_id,
                engine_id=data.engine_id,
                cycle=data.cycle,
                rul_prediction=round(rul_pred, 1),
                anomaly_flag=anomaly_flag
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
            "confidence": round(confidence, 2)
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
