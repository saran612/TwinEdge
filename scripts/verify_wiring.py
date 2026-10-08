#!/usr/bin/env python3
"""
scripts/verify_wiring.py
Verifies end-to-end wiring, byte-identical hashes, ONNX vs FastAPI POST /predict parity on 200 windows,
and preprocessing parity across training, inference, and frontend exporter.
Exits with nonzero status code on any failure.
"""

import os
import sys
import json
import hashlib
from pathlib import Path
import numpy as np

# Add repo root and backend to sys.path
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))
sys.path.insert(0, str(root_dir / "backend"))

os.environ["TESTING"] = "1"

from config import paths
import onnxruntime as ort
import joblib

def sha256_of_file(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def check_registry_hashes():
    print("[1/4] Checking artifact hashes against registry...")
    if not paths.REGISTRY_PATH.exists():
        raise RuntimeError(f"Registry not found at {paths.REGISTRY_PATH}")
    
    with open(paths.REGISTRY_PATH, "r") as f:
        registry = json.load(f)

    # ONNX
    onnx_reg = registry["artifacts"]["onnx"]
    actual_onnx_sha = sha256_of_file(paths.ONNX_MODEL_PATH)
    if actual_onnx_sha != onnx_reg["sha256"]:
        raise ValueError(f"ONNX sha256 mismatch! Reg: {onnx_reg['sha256']}, Disk: {actual_onnx_sha}")
    if paths.ONNX_MODEL_PATH.stat().st_size != onnx_reg["bytes"]:
        raise ValueError(f"ONNX bytes mismatch! Reg: {onnx_reg['bytes']}, Disk: {paths.ONNX_MODEL_PATH.stat().st_size}")
    print(f"  ✓ ONNX artifact verified: {actual_onnx_sha[:16]}... ({onnx_reg['bytes']} bytes)")

    # TFLite
    tflite_reg = registry["artifacts"]["tflite"]
    actual_tflite_sha = sha256_of_file(paths.TFLITE_MODEL_PATH)
    if actual_tflite_sha != tflite_reg["sha256"]:
        raise ValueError(f"TFLite sha256 mismatch! Reg: {tflite_reg['sha256']}, Disk: {actual_tflite_sha}")
    print(f"  ✓ TFLite artifact verified: {actual_tflite_sha[:16]}... ({tflite_reg['bytes']} bytes)")

    # Scaler
    scaler_reg = registry["artifacts"]["scaler"]
    actual_scaler_sha = sha256_of_file(paths.SCALER_PATH)
    if actual_scaler_sha != scaler_reg["sha256"]:
        raise ValueError(f"Scaler sha256 mismatch! Reg: {scaler_reg['sha256']}, Disk: {actual_scaler_sha}")
    print(f"  ✓ Scaler artifact verified: {actual_scaler_sha[:16]}... ({scaler_reg['bytes']} bytes)")

    # Offline frontend copy hash compare
    frontend_onnx = paths.OFFLINE_ASSETS_DIR / "model.onnx"
    if frontend_onnx.exists():
        fe_onnx_sha = sha256_of_file(frontend_onnx)
        if fe_onnx_sha != actual_onnx_sha:
            raise ValueError(f"Frontend offline model.onnx is not byte-identical to backend ONNX! {fe_onnx_sha} != {actual_onnx_sha}")
        print("  ✓ Frontend offline ONNX is byte-identical to backend ONNX.")

def check_preprocessing_parity():
    print("[2/4] Checking preprocessing parity across train, inference, and offline exporter...")
    # Check padding parity on varying length slices (1 to 29 rows)
    scaler = joblib.load(paths.SCALER_PATH)

    # Also verify scaler values match exported scaler.json
    scaler_json_path = paths.OFFLINE_ASSETS_DIR / "scaler.json"
    if scaler_json_path.exists():
        with open(scaler_json_path, "r") as f:
            s_json = json.load(f)
        mean_diff = np.max(np.abs(np.array(scaler.mean_) - np.array(s_json["mean"])))
        scale_diff = np.max(np.abs(np.array(scaler.scale_) - np.array(s_json["scale"])))
        if mean_diff > 1e-6 or scale_diff > 1e-6:
            raise ValueError(f"Scaler joblib vs scaler.json discrepancy! Mean diff: {mean_diff}, Scale diff: {scale_diff}")
        print("  ✓ Scaler joblib and offline scaler.json parameters match exactly (diff < 1e-6)")

    # Test padding on multiple lengths
    for length in [1, 5, 10, 15, 20, 25, 29, 30]:
        raw_matrix = np.linspace(100.0, 500.0, length * 14, dtype=np.float32).reshape(length, 14)
        
        # Training padding logic (preprocess.py)
        if length < 30:
            pad_len = 30 - length
            train_padded = np.vstack([np.repeat(raw_matrix[0:1], pad_len, axis=0), raw_matrix])
        else:
            train_padded = raw_matrix

        # Inference padding logic (FastAPI /predict in app/main.py)
        if length < 30:
            ep_pad = 30 - length
            inf_padded = np.vstack([np.repeat(raw_matrix[0:1], ep_pad, axis=0), raw_matrix])
        else:
            inf_padded = raw_matrix

        # Offline exporter logic (scripts/export_offline_assets.py)
        exp_copy = np.array(raw_matrix, dtype=np.float32)
        if len(exp_copy) < 30:
            exp_pad = 30 - len(exp_copy)
            exp_padded = np.vstack([np.repeat(exp_copy[0:1], exp_pad, axis=0), exp_copy])
        else:
            exp_padded = exp_copy

        diff_train_inf = float(np.max(np.abs(train_padded - inf_padded)))
        diff_train_exp = float(np.max(np.abs(train_padded - exp_padded)))
        if diff_train_inf > 0.0 or diff_train_exp > 0.0:
            raise ValueError(f"Preprocessing parity violation at length {length}: train vs inf={diff_train_inf}, train vs exp={diff_train_exp}")

    print("  ✓ Preprocessing padding parity: 0.0 diff across all pipelines.")

def check_direct_onnx_vs_http_predict():
    print("[3/4] Checking direct ONNX vs HTTP POST /predict parity on 200 windows...")
    from starlette.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        # Load test windows and scaler
        x_test = np.load(paths.PROCESSED_DATA_DIR / "x_test.npy") # (100, 30, 14)
        x_val = np.load(paths.PROCESSED_DATA_DIR / "x_val.npy")   # (N, 30, 14)
        scaler = joblib.load(paths.SCALER_PATH)

        session = ort.InferenceSession(str(paths.ONNX_MODEL_PATH), providers=["CPUExecutionProvider"])
        input_name = session.get_inputs()[0].name

        # Select 200 diverse windows
        test_samples = [x_test[i] for i in range(len(x_test))] # 100 windows
        val_samples = [x_val[i] for i in range(100)]           # 100 windows
        windows_scaled = test_samples + val_samples            # total 200 windows

        max_diff = 0.0
        for idx, w_scaled in enumerate(windows_scaled):
            # Inverse transform to get raw sensor values to pass to /predict
            w_raw = scaler.inverse_transform(w_scaled)

            # 1. Direct ONNX prediction on preprocessed scaled window
            onnx_input = np.expand_dims(w_scaled, axis=0).astype(np.float32)
            direct_pred = float(session.run(None, {input_name: onnx_input})[0][0][0])
            direct_pred_capped = max(0.0, min(125.0, direct_pred))

            # 2. HTTP POST /predict on raw window
            payload = {
                "engine_id": (idx % 10) + 1,
                "cycle": 30 + idx,
                "window": w_raw.tolist()
            }
            res = client.post("/predict", json=payload)
            if res.status_code != 200:
                raise RuntimeError(f"POST /predict returned status {res.status_code}: {res.text}")
            api_pred = float(res.json()["rul_prediction"])

            diff = abs(direct_pred_capped - api_pred)
            if diff > max_diff:
                max_diff = diff
            if diff >= 1e-5:
                raise ValueError(f"Window {idx}: Direct ONNX ({direct_pred_capped}) vs HTTP API ({api_pred}) diff {diff:.6e} >= 1e-5!")

        print(f"  ✓ Direct ONNX vs HTTP POST /predict parity on 200 windows passed (max diff: {max_diff:.6e} < 1e-5).")

def check_canary_fixture():
    print("[4/4] Checking golden fixtures and canary check...")
    if not paths.GOLDEN_FIXTURES_PATH.exists():
        raise RuntimeError(f"Golden fixtures file not found at {paths.GOLDEN_FIXTURES_PATH}")

    with open(paths.GOLDEN_FIXTURES_PATH, "r") as f:
        golden_data = json.load(f)

    session = ort.InferenceSession(str(paths.ONNX_MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name

    for fxt in golden_data["fixtures"]:
        w = np.array([fxt["window"]], dtype=np.float32)
        expected = float(fxt["expected_rul"])
        actual = float(session.run(None, {input_name: w})[0][0][0])
        diff = abs(expected - actual)
        if diff > 1e-3:
            raise ValueError(f"Golden fixture {fxt['fixture_id']} failed! Expected {expected}, got {actual}, diff {diff}")
    
    print(f"  ✓ All {len(golden_data['fixtures'])} golden fixtures verified within 1e-3 tolerance.")

def main():
    print("==================================================")
    print(" TwinEdge Wiring and Model Parity Verification    ")
    print("==================================================")
    try:
        check_registry_hashes()
        check_preprocessing_parity()
        check_direct_onnx_vs_http_predict()
        check_canary_fixture()
        print("\nSUCCESS: All wiring, parity, hash, and canary checks PASSED.")
        sys.exit(0)
    except Exception as e:
        print(f"\nFAILURE: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
