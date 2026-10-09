#!/usr/bin/env python3
"""
scripts/export_edge_model.py
Exports twinedge_rul.onnx and associated scaler into:
- edge_model.npz (NumPy arrays for CNN & Dense weights/biases, scaler mean/scale)
- edge_model.json (op topology, feature order, scaler params, SHA256 hashes, parity stats)
- canary_fixtures.json (5 golden canary windows with reference outputs)

Verifies parity against onnxruntime on >= 1000 windows.
Refuses export if maximum absolute difference >= 1e-3 cycles.
"""
import os
import sys
import json
import hashlib
import time
import numpy as np

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
    onnx_path = os.path.join(repo_root, "backend", "model", "twinedge_rul.onnx")
    registry_path = os.path.join(repo_root, "models", "registry.json")
    x_val_path = os.path.join(repo_root, "backend", "data", "processed", "x_val.npy")
    out_dir = os.path.join(repo_root, "jetson_node", "model")
    os.makedirs(out_dir, exist_ok=True)

    print("=== TwinEdge Edge Model Exporter ===")
    if not os.path.exists(onnx_path):
        print("ERROR: ONNX model not found at", onnx_path)
        sys.exit(1)

    import onnx
    from onnx import numpy_helper
    import onnxruntime as ort

    onnx_sha = compute_sha256(onnx_path)
    print("ONNX Model SHA256:", onnx_sha)

    m = onnx.load(onnx_path)
    inits = {init.name: numpy_helper.to_array(init) for init in m.graph.initializer}

    # Extract weights and biases
    # Conv1: (32, 14, 1, 5) -> (32, 14, 5)
    w_conv1 = inits['aerosentinel_rul_cnn_1/conv1d_1/convolution/ExpandDims_1:0'][:, :, 0, :].astype(np.float32)
    b_conv1 = inits['const_fold_opt__46'][0, :, 0].astype(np.float32)

    # Conv2: (64, 32, 1, 5) -> (64, 32, 5)
    w_conv2 = inits['aerosentinel_rul_cnn_1/conv1d_1_2/convolution/ExpandDims_1:0'][:, :, 0, :].astype(np.float32)
    b_conv2 = inits['const_fold_opt__49'][0, :, 0].astype(np.float32)

    # Dense1: (64, 64)
    w_dense1 = inits['aerosentinel_rul_cnn_1/dense_1/Cast/ReadVariableOp:0'].astype(np.float32)
    b_dense1 = inits['aerosentinel_rul_cnn_1/dense_1/BiasAdd/ReadVariableOp:0'].astype(np.float32)

    # Dense2 (RUL): (64, 1)
    w_dense2 = inits['aerosentinel_rul_cnn_1/rul_1/Cast/ReadVariableOp:0'].astype(np.float32)
    b_dense2 = inits['aerosentinel_rul_cnn_1/rul_1/Add/ReadVariableOp:0'].astype(np.float32)

    # Scaler mean & scale
    scaler_mean = np.array([
        642.6776058209045, 1590.4890972767346, 1408.879098484391, 553.3730523519112,
        2388.0962586800315, 9065.39918241652, 47.539670913592175, 521.4170762635106,
        2388.0958637763415, 8143.908227160196, 8.442025336634263, 393.20536199504863,
        38.817927057544836, 23.29047645069742
    ], dtype=np.float32)

    scaler_scale = np.array([
        0.4981092667920182, 6.085225261877313, 8.965345042371922, 0.8777454226412287,
        0.07064497424024783, 22.659117194571188, 0.26572538770796555, 0.7349679515339211,
        0.07170647986645737, 19.586490804857164, 0.03750697070147779, 1.5462705034856816,
        0.17986699725021163, 0.10740198924596424
    ], dtype=np.float32)

    features = [
        's_2', 's_3', 's_4', 's_7', 's_8', 's_9',
        's_11', 's_12', 's_13', 's_14', 's_15', 's_17', 's_20', 's_21'
    ]

    # Save NPZ weights
    npz_path = os.path.join(out_dir, "edge_model.npz")
    np.savez_compressed(
        npz_path,
        w_conv1=w_conv1,
        b_conv1=b_conv1,
        w_conv2=w_conv2,
        b_conv2=b_conv2,
        w_dense1=w_dense1,
        b_dense1=b_dense1,
        w_dense2=w_dense2,
        b_dense2=b_dense2,
        scaler_mean=scaler_mean,
        scaler_scale=scaler_scale
    )
    print("Saved weights to:", npz_path)

    # Pure NumPy forward implementation
    def numpy_forward(x_batch):
        # x_batch shape: (B, 30, 14)
        b_size = x_batch.shape[0]
        xt = np.transpose(x_batch, (0, 2, 1)) # (B, 14, 30)
        # Pad on last dim: (2, 2)
        xt_p = np.pad(xt, ((0,0), (0,0), (2,2)), mode='constant')
        out1 = np.zeros((b_size, 32, 30), dtype=np.float32)
        for t in range(30):
            # (B, 14, 5) tensordot (32, 14, 5) -> (B, 32)
            out1[:, :, t] = np.tensordot(xt_p[:, :, t:t+5], w_conv1, axes=([1, 2], [1, 2])) + b_conv1
        out1 = np.maximum(out1, 0.0)

        out1_p = np.pad(out1, ((0,0), (0,0), (2,2)), mode='constant')
        out2 = np.zeros((b_size, 64, 30), dtype=np.float32)
        for t in range(30):
            out2[:, :, t] = np.tensordot(out1_p[:, :, t:t+5], w_conv2, axes=([1, 2], [1, 2])) + b_conv2
        out2 = np.maximum(out2, 0.0)

        # Global average pool over 30 time steps
        gap = np.mean(out2, axis=2) # (B, 64)
        d1 = np.dot(gap, w_dense1) + b_dense1
        d1 = np.maximum(d1, 0.0)
        rul = np.dot(d1, w_dense2) + b_dense2
        return rul

    # Run parity verification vs ONNX Runtime on >= 1000 windows
    print("\n--- Verifying Parity vs ONNX Runtime ---")
    sess = ort.InferenceSession(onnx_path, providers=['CPUExecutionProvider'])
    
    if os.path.exists(x_val_path):
        val_data = np.load(x_val_path).astype(np.float32)
        test_samples = val_data[:1200]
    else:
        print("x_val.npy not found, generating 1200 realistic synthetic windows")
        np.random.seed(42)
        test_samples = np.random.randn(1200, 30, 14).astype(np.float32)

    print(f"Testing parity on {len(test_samples)} windows...")
    t0 = time.time()
    ort_preds = sess.run(None, {'sensor_window': test_samples})[0]
    ort_time = time.time() - t0

    t1 = time.time()
    np_preds = numpy_forward(test_samples)
    np_time = time.time() - t1

    abs_diffs = np.abs(ort_preds - np_preds)
    max_diff = float(np.max(abs_diffs))
    mean_diff = float(np.mean(abs_diffs))
    rmse_diff = float(np.sqrt(np.mean((ort_preds - np_preds) ** 2)))

    print(f"Max Absolute Diff: {max_diff:.8f}")
    print(f"Mean Absolute Diff: {mean_diff:.8f}")
    print(f"RUL RMSE Diff:     {rmse_diff:.8f}")
    print(f"ORT time ({len(test_samples)}): {ort_time:.4f}s | Pure NumPy time: {np_time:.4f}s")

    # Strict export threshold: max_diff must be < 1e-3 cycles
    TOLERANCE = 1e-3
    if max_diff >= TOLERANCE:
        print(f"FATAL: Max diff {max_diff} exceeds tolerance {TOLERANCE}! Aborting export.")
        sys.exit(1)
    print(f"PARITY CHECK PASSED (max_diff < {TOLERANCE})")

    # Generate canary fixtures (5 golden windows)
    canary_windows = test_samples[:5]
    canary_fixtures = []
    for idx, win in enumerate(canary_windows):
        exp_rul = float(numpy_forward(win.reshape(1, 30, 14))[0, 0])
        canary_fixtures.append({
            "fixture_id": f"canary_window_{idx}",
            "window": win.tolist(),
            "expected_rul": exp_rul
        })

    canary_path = os.path.join(out_dir, "canary_fixtures.json")
    with open(canary_path, "w") as f:
        json.dump({
            "version": 1,
            "source_onnx_sha256": onnx_sha,
            "tolerance": 1e-3,
            "fixtures": canary_fixtures
        }, f, indent=2)
    print("Saved canary fixtures to:", canary_path)

    # Save model metadata JSON
    meta = {
        "model_name": "twinedge_rul_cnn_1d",
        "schema_version": 1,
        "source_onnx_path": "backend/model/twinedge_rul.onnx",
        "source_onnx_sha256": onnx_sha,
        "exported_at": int(time.time()),
        "input_signature": {
            "name": "sensor_window",
            "shape": [1, 30, 14],
            "dtype": "float32"
        },
        "output_signature": {
            "name": "rul",
            "shape": [1, 1],
            "dtype": "float32"
        },
        "rul_cap": 125.0,
        "window_size_n": 30,
        "feature_count": 14,
        "features": features,
        "scaler": {
            "mean": scaler_mean.tolist(),
            "scale": scaler_scale.tolist()
        },
        "parity_stats": {
            "eval_windows_count": int(len(test_samples)),
            "max_abs_diff": max_diff,
            "mean_abs_diff": mean_diff,
            "rul_rmse_diff": rmse_diff,
            "tolerance": TOLERANCE,
            "passed": True
        }
    }
    json_path = os.path.join(out_dir, "edge_model.json")
    with open(json_path, "w") as f:
        json.dump(meta, f, indent=2)
    print("Saved edge model descriptor to:", json_path)
    print("=== Export Complete & Verified ===")

if __name__ == "__main__":
    main()
