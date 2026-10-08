#!/usr/bin/env python3
"""
scripts/benchmark_model.py
Standalone efficiency benchmark script for TwinEdge models (ONNX, TFLite).
Runs on any machine (desktop or edge device) and outputs structured JSON benchmark results.
Usage:
    python scripts/benchmark_model.py [--label HARDWARE_LABEL] [--output OUTPUT_JSON]
"""

import os
import sys
import time
import json
import argparse
import platform
import multiprocessing
from pathlib import Path
import numpy as np

# Path resolutions
root_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root_dir))

try:
    from config import paths
    ONNX_PATH = str(paths.ONNX_MODEL_PATH)
    TFLITE_PATH = str(paths.TFLITE_MODEL_PATH)
except Exception:
    ONNX_PATH = str(root_dir / "backend" / "model" / "twinedge_rul.onnx")
    TFLITE_PATH = str(root_dir / "backend" / "model" / "twinedge_rul.tflite")

def get_peak_rss_mb():
    try:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0 # Linux gives KB
    except Exception:
        return 0.0

def benchmark_onnx(onnx_path, batches=[1, 8, 32, 128], num_runs=1000, num_threads=None):
    import onnxruntime as ort
    
    opts = ort.SessionOptions()
    if num_threads:
        opts.intra_op_num_threads = num_threads
        opts.inter_op_num_threads = num_threads
        
    t0 = time.perf_counter()
    session = ort.InferenceSession(onnx_path, sess_options=opts, providers=["CPUExecutionProvider"])
    load_time_ms = (time.perf_counter() - t0) * 1000.0
    
    in_name = session.get_inputs()[0].name
    results_by_batch = {}
    
    for b in batches:
        dummy_input = np.random.randn(b, 30, 14).astype(np.float32)
        
        # Warmup
        for _ in range(30):
            session.run(None, {in_name: dummy_input})
            
        times = []
        for _ in range(num_runs):
            t_start = time.perf_counter()
            session.run(None, {in_name: dummy_input})
            times.append((time.perf_counter() - t_start) * 1000.0)
            
        times = np.array(times)
        p50 = float(np.percentile(times, 50))
        p95 = float(np.percentile(times, 95))
        p99 = float(np.percentile(times, 99))
        mean_lat = float(np.mean(times))
        throughput = float((b / (mean_lat / 1000.0)))
        
        results_by_batch[f"batch_{b}"] = {
            "batch_size": b,
            "latency_p50_ms": round(p50, 4),
            "latency_p95_ms": round(p95, 4),
            "latency_p99_ms": round(p99, 4),
            "latency_mean_ms": round(mean_lat, 4),
            "throughput_samples_per_sec": round(throughput, 2)
        }
        
    return {
        "load_time_ms": round(load_time_ms, 2),
        "batches": results_by_batch
    }

def benchmark_tflite(tflite_path, num_runs=1000):
    try:
        import tensorflow as tf
    except ImportError:
        return {"status": "UNVERIFIED", "reason": "TensorFlow not installed"}
        
    t0 = time.perf_counter()
    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()
    load_time_ms = (time.perf_counter() - t0) * 1000.0
    
    input_details = interpreter.get_input_details()
    output_details = interpreter.get_output_details()
    dummy = np.random.randn(1, 30, 14).astype(np.float32)
    
    # Warmup
    for _ in range(30):
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()
        
    times = []
    for _ in range(num_runs):
        t_start = time.perf_counter()
        interpreter.set_tensor(input_details[0]["index"], dummy)
        interpreter.invoke()
        times.append((time.perf_counter() - t_start) * 1000.0)
        
    times = np.array(times)
    p50 = float(np.percentile(times, 50))
    p95 = float(np.percentile(times, 95))
    p99 = float(np.percentile(times, 99))
    mean_lat = float(np.mean(times))
    throughput = float((1.0 / (mean_lat / 1000.0)))
    
    return {
        "load_time_ms": round(load_time_ms, 2),
        "batch_1": {
            "latency_p50_ms": round(p50, 4),
            "latency_p95_ms": round(p95, 4),
            "latency_p99_ms": round(p99, 4),
            "latency_mean_ms": round(mean_lat, 4),
            "throughput_samples_per_sec": round(throughput, 2)
        }
    }

def main():
    parser = argparse.ArgumentParser(description="TwinEdge Model Efficiency Benchmark")
    parser.add_argument("--label", default=f"{platform.machine()}-{platform.system()}", help="Hardware / Environment label")
    parser.add_argument("--onnx", default=ONNX_PATH, help="Path to ONNX model")
    parser.add_argument("--tflite", default=TFLITE_PATH, help="Path to TFLite model")
    parser.add_argument("--runs", type=int, default=1000, help="Number of benchmark iterations")
    parser.add_argument("--output", default="reports/model/benchmark_results.json", help="Output JSON path")
    args = parser.parse_args()

    print(f"==================================================")
    print(f" TwinEdge Model Benchmark: {args.label}            ")
    print(f"==================================================")
    
    env_info = {
        "hardware_label": args.label,
        "platform": platform.platform(),
        "processor": platform.processor(),
        "cpu_count": multiprocessing.cpu_count(),
        "python_version": sys.version.split()[0],
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    }

    onnx_file_size = os.path.getsize(args.onnx) if os.path.exists(args.onnx) else 0
    tflite_file_size = os.path.getsize(args.tflite) if os.path.exists(args.tflite) else 0

    print("Running ONNX Benchmark (Default Threads)...")
    onnx_default = benchmark_onnx(args.onnx, batches=[1, 8, 32, 128], num_runs=args.runs)
    
    print("Running ONNX Benchmark (1 Thread - Edge-like)...")
    onnx_1thread = benchmark_onnx(args.onnx, batches=[1, 8], num_runs=args.runs, num_threads=1)
    
    print("Running TFLite Benchmark...")
    tflite_res = benchmark_tflite(args.tflite, num_runs=args.runs)

    peak_rss = get_peak_rss_mb()

    # Model complexity
    param_count = 16805
    macs = 378560
    flops = 757120

    report = {
        "environment": env_info,
        "model_complexity": {
            "parameter_count": param_count,
            "macs": macs,
            "flops": flops,
            "onnx_size_bytes": onnx_file_size,
            "tflite_size_bytes": tflite_file_size,
            "peak_rss_mb": round(peak_rss, 2)
        },
        "onnx_benchmark_default_threads": onnx_default,
        "onnx_benchmark_single_thread": onnx_1thread,
        "tflite_benchmark": tflite_res
    }

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\nBenchmark completed successfully. Saved to {out_path}")
    print(f"ONNX Batch 1 (Default): {onnx_default['batches']['batch_1']['latency_p50_ms']} ms (p50)")
    print(f"ONNX Batch 1 (1 Thread): {onnx_1thread['batches']['batch_1']['latency_p50_ms']} ms (p50)")
    if "batch_1" in tflite_res:
        print(f"TFLite Batch 1: {tflite_res['batch_1']['latency_p50_ms']} ms (p50)")

if __name__ == "__main__":
    main()
