import os
import json
import joblib
import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from influxdb_client import InfluxDBClient

from app.db import get_unresolved_alerts, get_all_alerts, signoff_alert, add_alert

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
    influx_token = os.getenv("INFLUXDB_TOKEN", "my-super-secret-admin-token-12345")
    try:
        influx_client = InfluxDBClient(url=influx_url, token=influx_token, org="twinedge")
        print(f"Connected to InfluxDB at {influx_url}")
    except Exception as e:
        print(f"Failed to connect to InfluxDB: {e}")

class WindowInput(BaseModel):
    engine_id: int
    cycle: int
    # 30 cycles of 14 active sensor values
    window: List[List[float]]

@app.get("/health")
def health():
    downstream_ok = False
    if influx_client:
        try:
            downstream_ok = influx_client.ping()
        except Exception:
            downstream_ok = False
    return {
        "status": "ok", 
        "message": "TwinEdge backend inference service running",
        "model_loaded": ort_session is not None,
        "scaler_loaded": scaler is not None,
        "downstream_connected": downstream_ok,
        "metadata": metadata
    }

@app.post("/predict")
def predict(data: WindowInput):
    global ort_session, scaler
    if ort_session is None or scaler is None:
        raise HTTPException(status_code=503, detail="Model or Scaler not loaded on server.")
        
    try:
        # Check window shape: must be (30, 14)
        window_arr = np.array(data.window, dtype=np.float32)
        if window_arr.shape != (30, 14):
            raise HTTPException(
                status_code=400, 
                detail=f"Expected window shape (30, 14), got {window_arr.shape}"
            )
            
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
        # Rule: RUL < 60 cycles marks an operational warning/alert
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

        return {
            "rul_prediction": round(rul_pred, 2),
            "anomaly_flag": anomaly_flag,
            "confidence": round(confidence, 2)
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


# H1. GET /telemetry/recent - last N telemetry points from InfluxDB
@app.get("/telemetry/recent")
def get_recent_telemetry(engine_id: Optional[int] = None, limit: int = 50):
    global influx_client
    if influx_client is None:
        return []
        
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
        records = []
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

        return records
    except Exception as e:
        # Fallback: return empty list or log error (offline resilience handled via subscriber local cache)
        print(f"InfluxDB read error: {e}")
        return []

# H2. GET /alerts - current alerts in the sign-off queue
@app.get("/alerts")
def get_alerts(unresolved_only: bool = True):
    if unresolved_only:
        return get_unresolved_alerts()
    return get_all_alerts()

# H3. POST /alerts/{id}/signoff - AME decision recording
class SignoffRequest(BaseModel):
    status: str # APPROVED, REJECTED, ESCALATED
    notes: Optional[str] = ""

@app.post("/alerts/{alert_id}/signoff")
def post_signoff(alert_id: str, request: SignoffRequest):
    valid_statuses = ["APPROVED", "REJECTED", "ESCALATED"]
    if request.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {valid_statuses}")
        
    try:
        signoff_alert(alert_id, request.status, request.notes)
        return {"status": "success", "message": f"Alert {alert_id} signed off as {request.status}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
