"""
Offline Assets Exporter for TwinEdge (Task F2)
Reads backend artifacts without modifying them and writes copies under frontend/public/offline/
"""
import os
import shutil
import hashlib
import json
import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
import onnxruntime as ort

def sha256_file(filepath):
    h = hashlib.sha256()
    with open(filepath, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        import sys
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        from config import paths
        raw_dir = str(paths.RAW_DATA_DIR)
        processed_dir = str(paths.PROCESSED_DATA_DIR)
        src_onnx = str(paths.ONNX_MODEL_PATH)
        scaler_path = str(paths.SCALER_PATH)
        out_dir = str(paths.OFFLINE_ASSETS_DIR)
    except Exception:
        backend_dir = os.path.join(repo_root, "backend")
        raw_dir = os.path.join(backend_dir, "data", "raw")
        processed_dir = os.path.join(backend_dir, "data", "processed")
        model_dir = os.path.join(backend_dir, "model")
        src_onnx = os.path.join(model_dir, "twinedge_rul.onnx")
        scaler_path = os.path.join(processed_dir, "scaler.joblib")
        out_dir = os.path.join(repo_root, "frontend", "public", "offline")

    fixtures_dir = os.path.join(repo_root, "frontend", "src", "test", "fixtures")
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(fixtures_dir, exist_ok=True)

    print("Exporting offline assets to:", out_dir)

    # 1. Copy model.onnx
    dst_onnx = os.path.join(out_dir, "model.onnx")
    shutil.copyfile(src_onnx, dst_onnx)
    print(f"Copied model.onnx ({os.path.getsize(dst_onnx)} bytes)")

    # 2. Export scaler.json
    scaler = joblib.load(scaler_path)
    scaler_dict = {
        "mean": scaler.mean_.tolist(),
        "scale": scaler.scale_.tolist(),
        "var": scaler.var_.tolist(),
        "n_features_in": int(scaler.n_features_in_)
    }
    with open(os.path.join(out_dir, "scaler.json"), "w") as f:
        json.dump(scaler_dict, f, indent=2)
    print("Exported scaler.json")

    # 3. Export features.json & component map reference
    sensor_names_14 = [
        "s_2", "s_3", "s_4", "s_7", "s_8", "s_9",
        "s_11", "s_12", "s_13", "s_14", "s_15", "s_17", "s_20", "s_21"
    ]
    sensor_metadata = [
        {"id": "s_2", "name": "T24", "description": "LPC Outlet Temp", "unit": "°R"},
        {"id": "s_3", "name": "T30", "description": "HPC Outlet Temp", "unit": "°R"},
        {"id": "s_4", "name": "T50", "description": "LPT Outlet Temp", "unit": "°R"},
        {"id": "s_7", "name": "P30", "description": "HPC Outlet Static Pressure", "unit": "psia"},
        {"id": "s_8", "name": "Nf", "description": "Fan Speed", "unit": "rpm"},
        {"id": "s_9", "name": "Nc", "description": "Core Speed", "unit": "rpm"},
        {"id": "s_11", "name": "Ps30", "description": "HPC Static Pressure", "unit": "psia"},
        {"id": "s_12", "name": "phi", "description": "Fuel-Air Ratio", "unit": "—"},
        {"id": "s_13", "name": "NRf", "description": "Corrected Fan Speed", "unit": "rpm"},
        {"id": "s_14", "name": "NRc", "description": "Corrected Core Speed", "unit": "rpm"},
        {"id": "s_15", "name": "BPR", "description": "Bypass Ratio", "unit": "—"},
        {"id": "s_17", "name": "htBleed", "description": "Bleed Enthalpy", "unit": "—"},
        {"id": "s_20", "name": "W31", "description": "HPT Coolant Bleed", "unit": "lbm/s"},
        {"id": "s_21", "name": "W32", "description": "LPT Coolant Bleed", "unit": "lbm/s"},
    ]
    features_payload = {
        "feature_ids": sensor_names_14,
        "features": sensor_metadata,
        "component_map_assumed": "src/config/component_map.json"
    }
    with open(os.path.join(out_dir, "features.json"), "w") as f:
        json.dump(features_payload, f, indent=2)
    print("Exported features.json")

    # 4. Reproduce data split using EXACT preprocess.py logic
    index_names = ['unit_number', 'time_in_cycles']
    setting_names = ['setting_1', 'setting_2', 'setting_3']
    all_sensor_names = [f's_{i}' for i in range(1, 22)]
    col_names = index_names + setting_names + all_sensor_names

    train_path = os.path.join(raw_dir, 'train_FD001.txt')
    test_path = os.path.join(raw_dir, 'test_FD001.txt')
    rul_path = os.path.join(raw_dir, 'RUL_FD001.txt')

    train_df = pd.read_csv(train_path, sep=r'\s+', header=None, names=col_names)
    test_df = pd.read_csv(test_path, sep=r'\s+', header=None, names=col_names)
    test_rul = pd.read_csv(rul_path, sep=r'\s+', header=None, names=['RUL'])

    # Drop non-feature columns
    sensors_to_drop = ['s_1', 's_5', 's_6', 's_10', 's_16', 's_18', 's_19']
    train_df.drop(columns=sensors_to_drop + setting_names, inplace=True)
    test_df.drop(columns=sensors_to_drop + setting_names, inplace=True)

    # Compute piecewise target RUL on train
    max_cycle = train_df.groupby('unit_number')['time_in_cycles'].transform('max')
    train_df['RUL'] = (max_cycle - train_df['time_in_cycles']).clip(upper=125)

    # Unit-level split with random_state=42 exactly matching preprocess.py
    unique_units = train_df['unit_number'].unique()
    train_units, val_units = train_test_split(unique_units, test_size=0.2, random_state=42)

    train_split = train_df[train_df['unit_number'].isin(train_units)].copy()
    val_split = train_df[train_df['unit_number'].isin(val_units)].copy()

    # 5. Export training_stats.json (per-feature min/max/mean/std from training split)
    training_stats = {}
    for feat in sensor_names_14:
        vals = train_split[feat].values
        training_stats[feat] = {
            "min": float(vals.min()),
            "max": float(vals.max()),
            "mean": float(vals.mean()),
            "std": float(vals.std())
        }
    with open(os.path.join(out_dir, "training_stats.json"), "w") as f:
        json.dump(training_stats, f, indent=2)
    print("Exported training_stats.json")

    # 6. Export replay_engines.json
    # Bundles >=3 held-out validation engines (run to failure) + test engines 1-3 (truncated, true RUL known)
    replay_engines = []

    # Held-out validation engines from train_FD001 val split
    val_unit_ids = sorted(list(val_units))[:4] # Take first 4 held-out engines
    for uid in val_unit_ids:
        gdf = val_split[val_split['unit_number'] == uid].sort_values('time_in_cycles')
        cycles = gdf['time_in_cycles'].tolist()
        ruls = gdf['RUL'].tolist()
        # Compute baseline healthy vector (mean of first 30 cycles)
        first_30 = gdf.head(30)[sensor_names_14].values
        healthy_baseline = first_30.mean(axis=0).tolist()
        
        sensor_data = []
        for _, row in gdf.iterrows():
            sensor_data.append([float(row[s]) for s in sensor_names_14])
            
        replay_engines.append({
            "engine_id": int(uid),
            "split": "HELD-OUT VALIDATION",
            "total_cycles": len(cycles),
            "healthy_baseline": healthy_baseline,
            "cycles": cycles,
            "true_rul": ruls,
            "sensors": sensor_data
        })

    # Test engines 1, 2, 3 from test_FD001
    for test_id in [1, 2, 3]:
        gdf = test_df[test_df['unit_number'] == test_id].sort_values('time_in_cycles')
        final_test_rul = float(test_rul.iloc[test_id - 1]['RUL'])
        last_cycle = int(gdf['time_in_cycles'].max())
        
        cycles = gdf['time_in_cycles'].tolist()
        # Per spec: true RUL = final_RUL + (last_cycle - t), capped at 125
        true_ruls = [min(125.0, final_test_rul + (last_cycle - t)) for t in cycles]
        
        first_30 = gdf.head(30)[sensor_names_14].values
        healthy_baseline = first_30.mean(axis=0).tolist()
        
        sensor_data = []
        for _, row in gdf.iterrows():
            sensor_data.append([float(row[s]) for s in sensor_names_14])
            
        replay_engines.append({
            "engine_id": int(test_id),
            "split": "TEST",
            "total_cycles": len(cycles),
            "healthy_baseline": healthy_baseline,
            "cycles": cycles,
            "true_rul": true_ruls,
            "sensors": sensor_data
        })

    with open(os.path.join(out_dir, "replay_engines.json"), "w") as f:
        json.dump(replay_engines, f, indent=2)
    print(f"Exported replay_engines.json with {len(replay_engines)} engines")

    # 7. Generate Parity Fixture (>=200 windows)
    # Collect windows, run Python ONNX session, and record exact inputs and outputs
    ort_session = ort.InferenceSession(src_onnx, providers=['CPUExecutionProvider'])
    input_name = ort_session.get_inputs()[0].name

    parity_samples = []
    # Test windows across all replay engines
    for eng in replay_engines:
        s_arr = np.array(eng["sensors"], dtype=np.float32)
        n_cycles = len(s_arr)
        # Sample early-cycle windows (1 to 29 rows) and normal sliding windows
        sample_indices = list(range(1, 30)) + list(range(30, min(n_cycles + 1, 120), 2))
        for end_idx in sample_indices:
            if end_idx > n_cycles:
                continue
            window_slice = s_arr[:end_idx] if end_idx < 30 else s_arr[end_idx-30:end_idx]
            
            # Python Preprocessing:
            w_copy = np.array(window_slice, dtype=np.float32)
            if len(w_copy) < 30:
                pad_len = 30 - len(w_copy)
                w_copy = np.vstack([np.repeat(w_copy[0:1], pad_len, axis=0), w_copy])
            scaled = scaler.transform(w_copy)
            onnx_in = np.expand_dims(scaled, axis=0).astype(np.float32)
            
            # Python ORT output:
            out = ort_session.run(None, {input_name: onnx_in})
            py_rul = float(out[0][0][0])
            py_rul_capped = max(0.0, min(125.0, py_rul))
            
            parity_samples.append({
                "engine_id": eng["engine_id"],
                "cycle": end_idx,
                "input_window": window_slice.tolist(),
                "expected_padded_scaled": scaled.tolist(),
                "expected_rul_raw": py_rul,
                "expected_rul_capped": py_rul_capped
            })
            if len(parity_samples) >= 220:
                break
        if len(parity_samples) >= 220:
            break

    print(f"Generated {len(parity_samples)} parity samples")
    with open(os.path.join(fixtures_dir, "parity_windows.json"), "w") as f:
        json.dump(parity_samples, f)
    print("Saved parity_windows.json to test fixtures")

    # 8. Export manifest.json with sha256 of each file
    manifest = {
        "files": {
            "model.onnx": sha256_file(dst_onnx),
            "scaler.json": sha256_file(os.path.join(out_dir, "scaler.json")),
            "features.json": sha256_file(os.path.join(out_dir, "features.json")),
            "training_stats.json": sha256_file(os.path.join(out_dir, "training_stats.json")),
            "replay_engines.json": sha256_file(os.path.join(out_dir, "replay_engines.json")),
        },
        "engine_counts": len(replay_engines),
        "parity_sample_count": len(parity_samples),
        "dataset": "C-MAPSS FD001",
        "model_architecture": "1D-CNN (Window N=30, 14 sensors, RUL cap 125)"
    }
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print("Exported manifest.json")

if __name__ == "__main__":
    main()
