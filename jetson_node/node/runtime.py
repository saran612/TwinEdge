"""
jetson_node/node/runtime.py
Runtime Ladder implementation for TwinEdge Jetson node:
1. onnxruntime (CPUExecutionProvider) if installed and passes canary
2. pure NumPy interpreter built from edge_model.npz and edge_model.json
3. tflite_runtime if installed and passes canary

Python 3.6+ compatible (no dataclasses, no walrus, no asyncio).
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

class BaseRULRuntime(object):
    def __init__(self, name, model_sha):
        self.name = name
        self.model_sha = model_sha

    def predict_window(self, window_np):
        """
        window_np: (1, 30, 14) float32 normalized
        returns float RUL
        """
        raise NotImplementedError

class NumpyPureRuntime(BaseRULRuntime):
    def __init__(self, npz_path, json_path):
        with open(json_path, "r") as f:
            self.meta = json.load(f)
        self.model_sha = self.meta.get("source_onnx_sha256", compute_sha256(npz_path))
        super(NumpyPureRuntime, self).__init__("numpy_pure", self.model_sha)

        data = np.load(npz_path)
        self.w_conv1 = data["w_conv1"]
        self.b_conv1 = data["b_conv1"]
        self.w_conv2 = data["w_conv2"]
        self.b_conv2 = data["b_conv2"]
        self.w_dense1 = data["w_dense1"]
        self.b_dense1 = data["b_dense1"]
        self.w_dense2 = data["w_dense2"]
        self.b_dense2 = data["b_dense2"]
        self.scaler_mean = data["scaler_mean"]
        self.scaler_scale = data["scaler_scale"]

    def predict_window(self, window_np):
        b_size = window_np.shape[0]
        # Transpose from (B, 30, 14) to (B, 14, 30)
        xt = np.transpose(window_np, (0, 2, 1))
        # Temporal pad: (2, 2) on cycle dim
        xt_p = np.pad(xt, ((0, 0), (0, 0), (2, 2)), mode="constant")
        out1 = np.zeros((b_size, 32, 30), dtype=np.float32)
        for t in range(30):
            out1[:, :, t] = np.tensordot(xt_p[:, :, t:t+5], self.w_conv1, axes=([1, 2], [1, 2])) + self.b_conv1
        out1 = np.maximum(out1, 0.0)

        out1_p = np.pad(out1, ((0, 0), (0, 0), (2, 2)), mode="constant")
        out2 = np.zeros((b_size, 64, 30), dtype=np.float32)
        for t in range(30):
            out2[:, :, t] = np.tensordot(out1_p[:, :, t:t+5], self.w_conv2, axes=([1, 2], [1, 2])) + self.b_conv2
        out2 = np.maximum(out2, 0.0)

        gap = np.mean(out2, axis=2)
        d1 = np.dot(gap, self.w_dense1) + self.b_dense1
        d1 = np.maximum(d1, 0.0)
        rul = np.dot(d1, self.w_dense2) + self.b_dense2
        return float(rul[0, 0])

class OnnxruntimeRuntime(BaseRULRuntime):
    def __init__(self, onnx_path):
        import onnxruntime as ort
        self.model_sha = compute_sha256(onnx_path)
        super(OnnxruntimeRuntime, self).__init__("onnxruntime_cpu", self.model_sha)
        self.sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
        self.input_name = self.sess.get_inputs()[0].name

    def predict_window(self, window_np):
        inp = window_np.astype(np.float32)
        out = self.sess.run(None, {self.input_name: inp})
        return float(out[0][0][0])

class TfliteRuntime(BaseRULRuntime):
    def __init__(self, tflite_path):
        try:
            import tflite_runtime.interpreter as tflite
        except ImportError:
            import tensorflow.lite as tflite
        self.model_sha = compute_sha256(tflite_path)
        super(TfliteRuntime, self).__init__("tflite_cpu", self.model_sha)
        self.interpreter = tflite.Interpreter(model_path=tflite_path)
        self.interpreter.allocate_tensors()
        self.input_details = self.interpreter.get_input_details()
        self.output_details = self.interpreter.get_output_details()

    def predict_window(self, window_np):
        inp = window_np.astype(np.float32)
        self.interpreter.set_tensor(self.input_details[0]["index"], inp)
        self.interpreter.invoke()
        out = self.interpreter.get_tensor(self.output_details[0]["index"])
        return float(out[0][0])

def run_canary(runtime, canary_file_path):
    if not os.path.exists(canary_file_path):
        raise FileNotFoundError("Canary file not found: " + str(canary_file_path))
    with open(canary_file_path, "r") as f:
        data = json.load(f)
    fixtures = data.get("fixtures", [])
    tol = data.get("tolerance", 1e-3)
    if not fixtures:
        raise ValueError("No fixtures found in canary file")

    for f in fixtures:
        fid = f.get("fixture_id", "unknown")
        exp = f["expected_rul"]
        win = np.array(f["window"], dtype=np.float32).reshape(1, 30, 14)
        pred = runtime.predict_window(win)
        diff = abs(pred - exp)
        if diff > tol:
            raise RuntimeError("Canary FAILED on " + fid + " (" + runtime.name + "): expected " + str(exp) + ", got " + str(pred) + ", diff " + str(diff) + " > " + str(tol))
    return True

def select_runtime(model_dir, force_runtime=None):
    """
    Ladder selection:
    1. ONNX Runtime (if model exists & package importable & canary passes)
    2. NumPy Pure (from edge_model.npz & edge_model.json)
    3. TFLite (if model exists & package importable & canary passes)
    """
    canary_path = os.path.join(model_dir, "canary_fixtures.json")
    npz_path = os.path.join(model_dir, "edge_model.npz")
    json_path = os.path.join(model_dir, "edge_model.json")
    onnx_path = os.path.join(model_dir, "twinedge_rul.onnx")
    tflite_path = os.path.join(model_dir, "twinedge_rul.tflite")

    # If ONNX is in backend/model, check fallback path
    if not os.path.exists(onnx_path):
        alt_onnx = os.path.join(os.path.dirname(os.path.dirname(model_dir)), "backend", "model", "twinedge_rul.onnx")
        if os.path.exists(alt_onnx):
            onnx_path = alt_onnx

    if not os.path.exists(tflite_path):
        alt_tflite = os.path.join(os.path.dirname(os.path.dirname(model_dir)), "backend", "model", "twinedge_rul.tflite")
        if os.path.exists(alt_tflite):
            tflite_path = alt_tflite

    # 1. Option: Forced runtime
    if force_runtime == "numpy_pure":
        rt = NumpyPureRuntime(npz_path, json_path)
        run_canary(rt, canary_path)
        return rt
    elif force_runtime == "onnxruntime":
        rt = OnnxruntimeRuntime(onnx_path)
        run_canary(rt, canary_path)
        return rt
    elif force_runtime == "tflite":
        rt = TfliteRuntime(tflite_path)
        run_canary(rt, canary_path)
        return rt

    # Ladder 1: ONNX Runtime
    if os.path.exists(onnx_path):
        try:
            import onnxruntime
            rt = OnnxruntimeRuntime(onnx_path)
            run_canary(rt, canary_path)
            return rt
        except Exception as e:
            pass # fall to next rung

    # Ladder 2: Pure NumPy
    if os.path.exists(npz_path) and os.path.exists(json_path):
        try:
            rt = NumpyPureRuntime(npz_path, json_path)
            run_canary(rt, canary_path)
            return rt
        except Exception as e:
            pass

    # Ladder 3: TFLite
    if os.path.exists(tflite_path):
        try:
            rt = TfliteRuntime(tflite_path)
            run_canary(rt, canary_path)
            return rt
        except Exception as e:
            pass

    raise RuntimeError("Runtime Ladder exhausted! No viable ML runtime passed canary in: " + model_dir)
