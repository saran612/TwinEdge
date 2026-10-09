#!/usr/bin/env python3
"""
scripts/build_replay_pack.py
Builds replay_pack.npz containing:
- Selected held-out validation engines (run-to-failure): e.g. units 5, 11, 23, 77
- Selected test engines: e.g. units 1, 2, 3
- Raw sensor channels (14 sensors: s_2, s_3, s_4, s_7, s_8, s_9, s_11, s_12, s_13, s_14, s_15, s_17, s_20, s_21)
- Ground-truth true_rul for every cycle (sidecar, never model input)
- Dataset metadata and checksums
"""
import os
import sys
import json
import hashlib
import numpy as np
import pandas as pd

def compute_sha256(filepath):
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def main():
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    raw_dir = os.path.join(repo_root, "backend", "data", "raw")
    out_dir = os.path.join(repo_root, "jetson_node", "data")
    os.makedirs(out_dir, exist_ok=True)

    train_path = os.path.join(raw_dir, "train_FD001.txt")
    test_path = os.path.join(raw_dir, "test_FD001.txt")
    rul_path = os.path.join(raw_dir, "RUL_FD001.txt")

    if not os.path.exists(train_path):
        print("ERROR: train_FD001.txt not found at", train_path)
        sys.exit(1)

    index_names = ['unit', 'cycle']
    setting_names = ['setting_1', 'setting_2', 'setting_3']
    sensor_names = [f's_{i}' for i in range(1, 22)]
    col_names = index_names + setting_names + sensor_names

    train_df = pd.read_csv(train_path, sep=r'\s+', header=None, names=col_names)
    test_df = pd.read_csv(test_path, sep=r'\s+', header=None, names=col_names)
    test_rul_df = pd.read_csv(rul_path, sep=r'\s+', header=None, names=['final_rul'])

    features_14 = ['s_2', 's_3', 's_4', 's_7', 's_8', 's_9', 's_11', 's_12', 's_13', 's_14', 's_15', 's_17', 's_20', 's_21']

    # Held-out validation engines from train_FD001 (run-to-failure)
    val_units = [5, 11, 23, 77]
    # Test engines from test_FD001
    test_units = [1, 2, 3]

    pack_data = {}
    engine_manifest = []

    # 1. Validation engines (run-to-failure)
    for u in val_units:
        edf = train_df[train_df['unit'] == u].sort_values('cycle')
        max_cyc = int(edf['cycle'].max())
        sensor_matrix = edf[features_14].values.astype(np.float32) # (L, 14)
        cycles = edf['cycle'].values.astype(np.int32)
        true_rul = (max_cyc - cycles).astype(np.float32)

        key = f"val_unit_{u}"
        pack_data[f"{key}_sensors"] = sensor_matrix
        pack_data[f"{key}_cycles"] = cycles
        pack_data[f"{key}_true_rul"] = true_rul

        engine_manifest.append({
            "key": key,
            "split": "VAL",
            "unit": u,
            "cycles_count": len(cycles),
            "max_cycle": max_cyc,
            "min_cycle": int(cycles[0])
        })
        print(f"Added VAL engine {u}: {len(cycles)} cycles (run-to-failure)")

    # 2. Test engines (cutoff at operational cycle, final true RUL given in RUL_FD001)
    for u in test_units:
        edf = test_df[test_df['unit'] == u].sort_values('cycle')
        final_rul_val = float(test_rul_df.iloc[u - 1]['final_rul'])
        max_cyc = int(edf['cycle'].max())
        sensor_matrix = edf[features_14].values.astype(np.float32)
        cycles = edf['cycle'].values.astype(np.int32)
        # RUL at each cycle = final_rul_val + (max_cyc - cycle)
        true_rul = (final_rul_val + (max_cyc - cycles)).astype(np.float32)

        key = f"test_unit_{u}"
        pack_data[f"{key}_sensors"] = sensor_matrix
        pack_data[f"{key}_cycles"] = cycles
        pack_data[f"{key}_true_rul"] = true_rul

        engine_manifest.append({
            "key": key,
            "split": "TEST",
            "unit": u,
            "cycles_count": len(cycles),
            "max_cycle": max_cyc,
            "final_true_rul": final_rul_val
        })
        print(f"Added TEST engine {u}: {len(cycles)} cycles (test cutoff)")

    npz_path = os.path.join(out_dir, "replay_pack.npz")
    np.savez_compressed(npz_path, **pack_data)
    npz_sha = compute_sha256(npz_path)

    manifest_meta = {
        "dataset": "NASA C-MAPSS FD001",
        "features": features_14,
        "features_count": len(features_14),
        "replay_pack_sha256": npz_sha,
        "engines": engine_manifest
    }
    manifest_path = os.path.join(out_dir, "replay_manifest.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest_meta, f, indent=2)

    print(f"\nReplay pack generated successfully:")
    print(f"  NPZ: {npz_path} ({npz_sha[:16]}...)")
    print(f"  Manifest: {manifest_path}")

if __name__ == "__main__":
    main()
